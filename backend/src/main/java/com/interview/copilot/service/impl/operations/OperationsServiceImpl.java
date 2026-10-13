package com.interview.copilot.service.impl.operations;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.common.operations.OperationsCache;
import com.interview.copilot.common.operations.OperationsCollector;
import com.interview.copilot.common.operations.OperationsStore;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.model.operations.OperationEvent;
import com.interview.copilot.model.operations.OperationsSettings;
import com.interview.copilot.service.operations.OperationsService;
import com.interview.copilot.validation.operations.OperationPolicy;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class OperationsServiceImpl implements OperationsService {
    private final OperationsStore store;
    private final OperationsCache cache;
    private final OperationsCollector collector;
    private final ObjectMapper json;
    private final com.interview.copilot.common.operations.OperationsPrometheus prometheus;
    public OperationsServiceImpl(OperationsStore store,OperationsCache cache,OperationsCollector collector,ObjectMapper json,com.interview.copilot.common.operations.OperationsPrometheus prometheus) {
        this.prometheus=prometheus;
        this.store=store;this.cache=cache;this.collector=collector;this.json=json;
    }
    public boolean enabled(long user) { return cache.settings().allows(user); }
    public Map<String,Object> ingest(long user,JsonNode input) {
        if(!input.isObject() || !input.path("events").isArray() || input.path("events").size()>64
                || input.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length>256*1024) throw OperationPolicy.invalid();
        input.fieldNames().forEachRemaining(key -> {if(!List.of("events","droppedCount").contains(key)) throw OperationPolicy.invalid();});
        long reported=input.path("droppedCount").asLong(0);
        if(input.has("droppedCount") && (!input.get("droppedCount").isIntegralNumber() || reported<0 || reported>1_000_000)) throw OperationPolicy.invalid();
        var parsed=new java.util.ArrayList<OperationEvent>();
        for(JsonNode value:input.get("events")) {
            OperationPolicy.fields(value);
            try {
                var event=json.treeToValue(value,OperationEvent.class);OperationPolicy.event(event);
                if(!"desktop".equals(event.source())) throw OperationPolicy.invalid();
                parsed.add(event);
            } catch(com.fasterxml.jackson.core.JsonProcessingException error) {throw OperationPolicy.invalid();}
        }
        if(!enabled(user)) return Map.of("accepted",0,"dropped",parsed.size());
        collector.drop(reported);int accepted=0;
        for(var event:parsed) if(collector.offer(user,event,false)) accepted++;
        return Map.of("accepted",accepted,"dropped",parsed.size()-accepted);
    }
    public OperationsSettings settings() { return cache.settings(); }
    public OperationsSettings saveInput(long actor,JsonNode input) {
        if(!input.isObject() || !input.path("version").isIntegralNumber() || !input.path("enabled").isBoolean()
                || !input.path("allowedUserIds").isArray() || !input.path("thresholds").isObject()) throw OperationPolicy.invalid();
        try {return save(actor,json.treeToValue(input,OperationsSettings.class));}
        catch(com.fasterxml.jackson.core.JsonProcessingException error) {throw OperationPolicy.invalid();}
    }
    public OperationsSettings save(long actor,OperationsSettings input) {
        OperationPolicy.settings(input);
        try {
            var next=new OperationsSettings(input.version()+1,input.enabled(),input.allowedUserIds(),input.thresholds());
            store.transaction(mapper -> {
                if(mapper.settingsUpdate(input.version(),cache.encode(next))!=1)
                    throw new ApiException(HttpStatus.CONFLICT,"OPERATIONS_VERSION_CONFLICT","观测设置已更新，请刷新后重试。");
                mapper.audit(actor,next.version());return next;
            });
            cache.settings(next);return next;
        } catch(ApiException error) {throw error;} catch(RuntimeException error) {throw unavailable();}
    }
    public Map<String,Object> overview(int hours) {
        hours(hours,2160);
        var result=new LinkedHashMap<String,Object>();result.put("updatedAt",Instant.now().toString());
        var business=cache.business(hours);result.put("business",business);
        try {
            var performance=cache.read(store.query(mapper -> mapper.aggregateSummary(hours)));
            if(hours<=168) {
                var precise=cache.read(store.query(mapper -> mapper.performanceSummary(hours)));
                performance.put("firstContentP95Ms",precise.get("firstContentP95Ms"));
                performance.put("sampleCount",precise.get("sampleCount"));performance.put("firstContentSource",precise.get("firstContentSource"));
            }
            performance.putAll(cache.read(store.query(mapper -> mapper.coverage(hours))));
            result.put("performance",performance);result.put("stale",Boolean.TRUE.equals(business.get("stale")));
        } catch(RuntimeException error) {
            var unknown=new LinkedHashMap<String,Object>();
            for(String key:List.of("answers","errors","timeouts","rejections","cancellations","degraded","firstContentP95Ms","sampleCount","clientReported","serverOnly","tokenSamples","retrievalCount","retrievalSource","degradedRate","errorRate","errorRateSamples","errorRateDenominator","llmSamples","tokenCoverage","tokenSource")) unknown.put(key,null);
            result.put("performance",unknown);result.put("stale",true);
        }
        return result;
    }
    public Map<String,Object> performance(int hours) {
        hours(hours,2160);
        try {
            boolean exact=hours<=168;
            var prom=exact?null:prometheus.trend(hours);
            var summary=cache.read(store.query(mapper -> exact?mapper.performanceSummary(hours):mapper.aggregateSummary(hours)));
            Object timingSource=prom!=null?prom.getFirst().get("source"):
                    summary.get("sampleCount") instanceof Number samples && samples.longValue()>0?summary.get("firstContentSource"):"unknown";
            var trend=prom!=null?prom:rows(store.query(mapper -> exact?mapper.trend(hours):mapper.histogramTrend(hours)));
            return Map.of("stages",rows(store.query(mapper -> exact ? mapper.stages(hours):mapper.histogramStages(hours))),
                    "trend",trend,
                    "comparisons",rows(store.query(mapper -> mapper.comparisons(Math.min(hours,168)))),
                    "updatedAt",Instant.now().toString(),"stale",!exact && prom==null,"percentileMethod",exact?"exact":"histogram_upper_bound",
                    "trendSource",prom!=null?"prometheus":"operations_database","comparisonHours",Math.min(hours,168),"firstContentSource",timingSource);
        } catch(RuntimeException error) {return Map.of("stages",List.of(),"trend",List.of(),"comparisons",List.of(),
                "updatedAt",Instant.now().toString(),"stale",true,"percentileMethod","unknown","trendSource","operations_database","comparisonHours",Math.min(hours,168),"firstContentSource","unknown");}
    }
    public Map<String,Object> traces(int hours,Long userId,String session,String model,String version,int page,int size) {
        hours(hours,168);filter(session,128);filter(model,200);filter(version,32);
        if(userId!=null && userId<1 || page<1 || page>10000 || size<1 || size>100) throw OperationPolicy.invalid();
        try {
            return Map.of("items",rows(store.query(mapper -> mapper.traces(hours,userId,session,model,version,size,(page-1)*size))),
                    "total",store.query(mapper -> mapper.traceCount(hours,userId,session,model,version)),"page",page,"size",size);
        } catch(RuntimeException error) {throw unavailable();}
    }
    public Map<String,Object> detail(String operation,long user) {
        OperationPolicy.uuid(operation);if(user<1) throw OperationPolicy.invalid();
        List<Map<String,Object>> events;
        try {events=rows(store.query(mapper -> mapper.detail(operation,user)));}
        catch(RuntimeException error) {throw unavailable();}
        if(events.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND,"OPERATION_NOT_FOUND","未找到可用链路明细。");
        boolean terminal=events.stream().anyMatch(event -> "answer.complete".equals(event.get("stage")) || "llm.complete".equals(event.get("stage")));
        return Map.of("operationId",operation,"userId",Long.toString(user),"events",events,"partial",!terminal || events.size()>=1000);
    }
    private void hours(int hours,int max) {if(hours<1 || hours>max) throw OperationPolicy.invalid();}
    private void filter(String value,int max) {if(value!=null && (value.length()>max || value.chars().anyMatch(Character::isISOControl))) throw OperationPolicy.invalid();}
    private List<Map<String,Object>> rows(List<String> values) {return values.stream().map(cache::read).toList();}
    public Map<String,Object> health() {return cache.health();}
    public OperationContext start(long user,String operation,String parent,String request,String session,String provider,String model) {
        OperationPolicy.uuid(operation);OperationPolicy.uuid(parent);
        if(!enabled(user)) return null;
        return OperationContext.start(user,operation,parent,request,session,provider,model,event -> {
            try {collector.offer(user,event,operation==null);} catch(RuntimeException error) {collector.drop(1);}
        });
    }
    public void finish(OperationContext context,String stage,String outcome,Map<String,Object> metadata) {
        if(context!=null) context.finish(stage,outcome,metadata);
    }
    public void point(OperationContext context,String stage,Map<String,Object> metadata) {
        if(context!=null) context.point(stage,metadata);
    }
    private ApiException unavailable() {return new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"OPERATIONS_UNAVAILABLE","观测存储暂时不可用，业务服务不受影响。");}
}
