package com.interview.copilot.common.operations;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.config.OperationsProperties;
import com.interview.copilot.mapper.observability.OperationsBusinessMapper;
import com.interview.copilot.model.operations.OperationsSettings;
import org.springframework.stereotype.Component;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.lang.management.ManagementFactory;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Component
public final class OperationsCache {
    private final OperationsStore store;
    private final ObjectMapper json;
    private final OperationsCollector collector;
    private final OperationsBusinessMapper business;
    private final OperationsProperties properties;
    private final javax.sql.DataSource datasource;
    private final ScheduledExecutorService jobs = Executors.newScheduledThreadPool(3,
            Thread.ofPlatform().daemon().name("operations-background-",0).factory());
    private final Map<Integer,Map<String,Object>> businessCache = new ConcurrentHashMap<>();
    private final Map<String,AlertState> alertStates = new ConcurrentHashMap<>();
    private volatile OperationsSettings settings = OperationsSettings.disabled();
    private volatile Map<String,Object> storage = Map.of();
    private volatile List<Map<String,Object>> alerts = List.of();
    private volatile boolean prometheus;
    private volatile Map<String,Object> asrStatistics=Map.of();
    private volatile long previousDropped;
    private final org.springframework.beans.factory.ObjectProvider<com.interview.copilot.security.asr.AsrProxy> asrProxy;
    public OperationsCache(OperationsStore store,ObjectMapper json,OperationsCollector collector,
            OperationsBusinessMapper business,OperationsProperties properties,javax.sql.DataSource datasource,
            org.springframework.beans.factory.ObjectProvider<com.interview.copilot.security.asr.AsrProxy> asrProxy) {
        this.asrProxy=asrProxy;
        this.store=store;this.json=json;this.collector=collector;this.business=business;
        this.properties=properties;this.datasource=datasource;
        businessCache.put(24,unknownBusiness());
    }
    @PostConstruct public void start() {
        jobs.scheduleWithFixedDelay(this::refreshSettings,0,10,TimeUnit.SECONDS);
        jobs.scheduleWithFixedDelay(collector::flush,1,1,TimeUnit.SECONDS);
        jobs.scheduleWithFixedDelay(this::refreshBusiness,0,60,TimeUnit.SECONDS);
        jobs.scheduleWithFixedDelay(this::refreshHealth,0,30,TimeUnit.SECONDS);
        jobs.scheduleWithFixedDelay(this::retention,60,3600,TimeUnit.SECONDS);
    }
    public OperationsSettings settings() { return settings; }
    public void settings(OperationsSettings value) { settings=value; }
    private void refreshSettings() {
        if(!store.configured()) return;
        try {
            var row=store.query(mapper -> mapper.settings());
            OperationsSettings value=json.readValue(row.get("payload").toString(),OperationsSettings.class);
            settings=new OperationsSettings(((Number)row.get("version")).longValue(),value.enabled(),value.allowedUserIds(),value.thresholds());
        } catch(RuntimeException | com.fasterxml.jackson.core.JsonProcessingException error) {
            settings=OperationsSettings.disabled();
        }
    }
    public Map<String,Object> business(int hours) {
        if(businessCache.size()<16) businessCache.putIfAbsent(hours,unknownBusiness());
        var cached=businessCache.getOrDefault(hours,unknownBusiness());
        var result=new LinkedHashMap<>(cached);
        Object updated=result.get("updatedAt");
        result.put("stale",updated==null || Instant.parse(updated.toString()).isBefore(Instant.now().minusSeconds(90)));
        return result;
    }
    private void refreshBusiness() {
        for(int hours:businessCache.keySet()) {
            try {
                var result=read(business.summary(hours));
                result.put("updatedAt",Instant.now().toString());result.put("stale",false);
                businessCache.put(hours,result);
                if(store.configured()) store.query(mapper -> {mapper.snapshot("business:"+hours,encode(result));return true;});
            } catch(RuntimeException error) { /* Preserve last good snapshot; API marks stale. */ }
        }
    }
    public Map<String,Object> unknownBusiness() {
        var result=new LinkedHashMap<String,Object>();
        for(String key:List.of("activeUsers","newUsers","interviews","usedSeconds","paidUsers","paidCents","refundCents","netCents","updatedAt")) result.put(key,null);
        var orders=new LinkedHashMap<String,Object>();
        for(String key:List.of("total","paid","pending","closed","failed")) orders.put(key,null);
        result.put("orders",orders);result.put("stale",true);return result;
    }
    public Map<String,Object> read(String value) {
        try { return json.readValue(value,new TypeReference<LinkedHashMap<String,Object>>(){}); }
        catch(com.fasterxml.jackson.core.JsonProcessingException error) { throw new IllegalStateException("Operations JSON unavailable",error); }
    }
    public String encode(Object value) {
        try { return json.writeValueAsString(value); }
        catch(com.fasterxml.jackson.core.JsonProcessingException error) { throw new IllegalStateException("Operations JSON unavailable",error); }
    }
    private void refreshHealth() {
        Map<String,Object> window=null;
        try {
            if(store.configured()) {
                storage=store.query(mapper -> mapper.storage());
                collector.storageFull(number(storage.get("bytes"))>=properties.storage().budgetBytes());
                asrStatistics=read(store.query(mapper -> mapper.asrHealth()));
                window=read(store.query(mapper -> mapper.alertWindow()));
            }
        } catch(RuntimeException error) {collector.failure();}
        checkPrometheus();
        evaluateAlerts(window==null?Map.of():window);
    }
    private void checkPrometheus() {
        try(var http=HttpClient.newBuilder().connectTimeout(java.time.Duration.ofSeconds(1)).build()) {
            var request=HttpRequest.newBuilder(URI.create(properties.prometheusUrl()+"/-/ready"))
                    .timeout(java.time.Duration.ofSeconds(1)).GET().build();
            prometheus=http.send(request,HttpResponse.BodyHandlers.discarding()).statusCode()==200;
        } catch(java.io.IOException | InterruptedException | IllegalArgumentException error) {
            prometheus=false;if(error instanceof InterruptedException) Thread.currentThread().interrupt();
        }
    }
    private void evaluateAlerts(Map<String,Object> window) {
        var t=settings.thresholds();
        long samples=number(window.get("samples"));long first=number(window.get("firstSamples"));
        long retrievals=number(window.get("retrievals"));
        signal("first_content",first>=t.minSamples() && window.get("firstContentP95Ms") instanceof Number n
                && n.doubleValue()>t.firstContentP95Ms(),"首正文 P95 超过阈值");
        signal("error_rate",samples>=t.minSamples() && number(window.get("errors"))/(double)samples>t.errorRate(),"回答失败率超过阈值");
        signal("degraded_rate",retrievals>=t.minSamples() && number(window.get("degraded"))/(double)retrievals>t.degradedRate(),"资料检索降级率超过阈值");
        var runtime=runtime();
        signal("connection_utilization",runtime.get("connectionsActive") instanceof Number active
                && runtime.get("connectionsMax") instanceof Number max && max.intValue()>0
                && active.doubleValue()/max.doubleValue()>t.connectionUtilization(),"业务连接池使用率超过阈值");
        signal("connection_pending",runtime.get("connectionsPending") instanceof Number pending && pending.longValue()>0,"业务连接池存在等待连接");
        long dropped=number(collector.queue().get("dropped"));
        signal("telemetry_dropped",dropped>previousDropped,"观测数据持续丢弃");previousDropped=dropped;
        signal("storage_budget",number(storage.get("bytes"))>=properties.storage().budgetBytes(),"观测数据库容量触及预算");
        signal("monitor_unavailable",store.configured() && (!store.available() || !prometheus),"观测存储或 Prometheus 持续不可用");
        alerts=alertStates.entrySet().stream().map(entry -> {
            var state=entry.getValue();return Map.<String,Object>of("id",entry.getKey(),"severity","warning","message",state.message(),
                    "state",state.firing() ? (Instant.now().isAfter(state.since().plusSeconds(t.sustainSeconds())) ? "firing":"pending") : "recovered",
                    "since",state.since().toString()); }).toList();
        if(store.available()) try {store.query(mapper -> {mapper.snapshot("alerts",encode(alerts));return true;});}
        catch(RuntimeException error) {collector.failure();}
    }
    private void signal(String id,boolean firing,String message) {
        alertStates.compute(id,(key,old) -> old!=null && old.firing()==firing ? old
                : old==null && !firing ? null : new AlertState(firing,Instant.now(),message));
    }
    private long number(Object value) { return value instanceof Number n ? n.longValue():0; }
    public Map<String,Object> runtime() {
        var memory=ManagementFactory.getMemoryMXBean().getHeapMemoryUsage();
        long count=0,time=0;for(var gc:ManagementFactory.getGarbageCollectorMXBeans()) {count+=Math.max(0,gc.getCollectionCount());time+=Math.max(0,gc.getCollectionTime());}
        var result=new LinkedHashMap<String,Object>();result.put("heapUsedBytes",memory.getUsed());result.put("heapMaxBytes",memory.getMax());
        result.put("gcCount",count);result.put("gcTimeMs",time);
        result.put("connectionsActive",null);result.put("connectionsMax",null);result.put("connectionsPending",null);
        if(datasource instanceof com.zaxxer.hikari.HikariDataSource pool && pool.getHikariPoolMXBean()!=null) {
            var bean=pool.getHikariPoolMXBean();result.put("connectionsActive",bean.getActiveConnections());
            result.put("connectionsMax",pool.getMaximumPoolSize());result.put("connectionsPending",bean.getThreadsAwaitingConnection());
        }
        return result;
    }
    public Map<String,Object> health() {
        var stored=new LinkedHashMap<String,Object>();stored.put("available",store.available());stored.put("bytes",storage.get("bytes"));
        stored.put("retentionDays",7);stored.put("budgetBytes",properties.storage().budgetBytes());stored.put("detailAvailableSince",storage.get("detailAvailableSince"));stored.put("trendAvailableSince",storage.get("trendAvailableSince"));
        var asr=new LinkedHashMap<String,Object>(asrStatistics);
        var proxy=asrProxy.getIfAvailable();asr.put("connections",proxy==null?null:proxy.activeConnections());
        asr.putIfAbsent("errors",null);asr.putIfAbsent("firstTranscriptP95Ms",null);asr.put("source","backend");asr.put("hours",24);
        asr.put("updatedAt",Instant.now().toString());asr.put("stale",!store.available());
        return Map.of("updatedAt",Instant.now().toString(),"stale",!store.available(),"queue",collector.queue(),"storage",stored,
                "runtime",runtime(),"telemetry",collector.telemetry(),"alerts",alerts,"asr",asr,"prometheus",Map.of("available",prometheus));
    }
    private void retention() {
        if(!store.configured()) return;
        try {
            store.query(mapper -> {mapper.retainAnswers();return mapper.maintain(properties.storage().budgetBytes());});
        } catch(RuntimeException error) { collector.failure(); }
    }
    @PreDestroy public void close() { jobs.shutdownNow(); }
    private record AlertState(boolean firing,Instant since,String message) {}
}
