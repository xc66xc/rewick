package com.interview.copilot.common.operations;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.entity.operations.OperationsEventRow;
import com.interview.copilot.model.operations.OperationEvent;
import com.interview.copilot.validation.operations.OperationPolicy;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Component;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.LongAdder;

/** MPSC queue: producers only reserve bounded memory and publish, never wait for a queue lock. */
@Component
public final class OperationsCollector {
    private static final int MAX_COUNT=2000;
    private static final long MAX_BYTES=8*1024*1024;
    private final OperationsStore store;
    private final ObjectMapper json;
    private final MeterRegistry metrics;
    private final ConcurrentLinkedQueue<Pending> queue=new ConcurrentLinkedQueue<>();
    private final ConcurrentHashMap<String,Long> seen=new ConcurrentHashMap<>();
    private final ConcurrentLinkedQueue<Seen> seenOrder=new ConcurrentLinkedQueue<>();
    // Upper 32 bits hold count, lower 32 bits bytes; one CAS reserves both, including in-flight.
    private final AtomicLong budget=new AtomicLong();
    private final AtomicBoolean flushing=new AtomicBoolean();
    private final AtomicReference<Flight> flight=new AtomicReference<>(new Flight(0,0,0));
    private final LongAdder accepted=new LongAdder(),dropped=new LongAdder(),failures=new LongAdder();
    private final LongAdder client=new LongAdder(),server=new LongAdder();
    private final Map<String,LongAdder> dropReasons=new ConcurrentHashMap<>();
    private volatile boolean closed;
    private volatile boolean storageFull;
    private volatile long retryAfter;
    private final Map<String,io.micrometer.core.instrument.Timer> timers=new ConcurrentHashMap<>();
    public OperationsCollector(OperationsStore store, ObjectMapper json, MeterRegistry metrics) {
        this.store = store; this.json = json; this.metrics = metrics;
        for(String stage:OperationPolicy.STAGES) for(String source:java.util.List.of("desktop","backend"))
            for(String provider:providers(stage)) for(String outcome:OperationPolicy.OUTCOMES) {
                String key=stage+"/"+source+"/"+provider+"/"+outcome;
                timers.put(key,io.micrometer.core.instrument.Timer.builder("operations.stage.duration")
                        .tags("stage",stage,"source",source,"providerType",provider,"outcome",outcome)
                        .serviceLevelObjectives(java.time.Duration.ofMillis(100),java.time.Duration.ofMillis(500),
                                java.time.Duration.ofSeconds(1),java.time.Duration.ofSeconds(2),java.time.Duration.ofSeconds(4),
                                java.time.Duration.ofSeconds(8),java.time.Duration.ofSeconds(16),java.time.Duration.ofSeconds(32),java.time.Duration.ofSeconds(128),java.time.Duration.ofSeconds(86400))
                        .register(metrics));
            }
        metrics.gauge("operations.queue.size",this,value -> ((Number)value.queue().get("size")).doubleValue());
        metrics.gauge("operations.queue.bytes",this,value -> ((Number)value.queue().get("bytes")).doubleValue());
    }
    public boolean offer(long user,OperationEvent event,boolean serverOnly) {
        try {
            if(closed) {drop(1,"shutdown");return false;}
            if(storageFull) {drop(1,"storage_budget");return false;}
            OperationPolicy.event(event);
            int size=estimatedBytes(event);
            var row=new OperationsEventRow(event.eventId(),event.operationId(),user,event.stage(),event.source(),
                    event.providerType(),event.outcome(),event.durationMs(),event.model(),event.appVersion(),
                    event.sessionId(),event.startedAt(),null,serverOnly,"llm.complete".equals(event.stage())
                    && event.metadata()!=null && java.util.Set.of("inputTokens","outputTokens","totalTokens").stream().anyMatch(event.metadata()::containsKey));
            int result=enqueue(row,size,event);
            if(result==2) {
                var timer=timers.get(event.stage()+"/"+event.source()+"/"+event.providerType()+"/"+event.outcome());
                if(timer==null) timer=timers.get(event.stage()+"/"+event.source()+"/"+providers(event.stage()).getFirst()+"/"+event.outcome());
                if(timer!=null) timer.record((long)(event.durationMs()*1_000_000),java.util.concurrent.TimeUnit.NANOSECONDS);
            }
            return result>0;
        } catch(RuntimeException error) {drop(1,"invalid");return false;}
    }
    private int enqueue(OperationsEventRow row,int size,OperationEvent event) {
        String key=row.eventId().toLowerCase(java.util.Locale.ROOT);
        long now=System.nanoTime();pruneSeen(now);
        if(seen.containsKey(key)) return 1;
        if(!reserve(size)) {drop(1,"capacity");return 0;}
        if(closed || storageFull) {release(size);drop(1,closed?"shutdown":"storage_budget");return 0;}
        if(seen.putIfAbsent(key,now)!=null) {release(size);return 1;}
        seenOrder.offer(new Seen(key,now));pruneSeen(now);
        queue.offer(new Pending(row,event,size,now,0));
        accepted.increment();if("desktop".equals(row.source())) client.increment();if(row.serverOnly()) server.increment();
        if(closed) {discardQueued("shutdown");return 0;}
        return 2;
    }
    private boolean reserve(int bytes) {
        while(true) {
            long previous=budget.get();long count=previous>>>32;long used=previous&0xffffffffL;
            if(count>=MAX_COUNT || used+bytes>MAX_BYTES) return false;
            if(budget.compareAndSet(previous,previous+(1L<<32)+bytes)) return true;
        }
    }
    private void release(int bytes) {budget.addAndGet(-((1L<<32)+bytes));}
    private void pruneSeen(long now) {
        for(int i=0;i<16;i++) {
            Seen head=seenOrder.peek();
            if(head==null || seen.size()<=5000 && now-head.nanos()<=120_000_000_000L) return;
            Seen removed=seenOrder.poll();if(removed!=null) seen.remove(removed.key(),removed.nanos());
        }
    }
    public void storageFull(boolean full) {storageFull=full;}
    public void flush() {
        if(closed || System.nanoTime()<retryAfter || !flushing.compareAndSet(false,true)) return;
        var batch=new java.util.ArrayList<Pending>();
        try {
            for(int i=0;i<64;i++) {var pending=queue.poll();if(pending==null) break;batch.add(pending);}
            if(batch.isEmpty()) return;
            long bytes=batch.stream().mapToLong(Pending::size).sum();flight.set(new Flight(batch.size(),bytes,batch.getFirst().enqueued()));
            if(storageFull) {batch.forEach(item -> {release(item.size());drop(1,"storage_budget");});return;}
            try {
                store.transaction(mapper -> {
                    mapper.insertBatch(batch.stream().map(this::stored).toList());
                    for(var item:batch) if(java.util.Set.of("answer.complete","llm.complete").contains(item.row().stage())) mapper.answer(item.row());
                    return true;
                });
                batch.forEach(item -> release(item.size()));
            } catch(RuntimeException error) {
                failure();retryAfter=System.nanoTime()+5_000_000_000L;
                batch.forEach(this::retry);
            }
        } finally {flight.set(new Flight(0,0,0));flushing.set(false);}
    }
    private void retry(Pending pending) {
        String reason=closed?"shutdown":storageFull?"storage_budget":"storage_unavailable";
        if(closed || storageFull || pending.attempts()>=2 || System.nanoTime()-pending.enqueued()>120_000_000_000L) {
            release(pending.size());drop(1,reason);return;
        }
        // Reservation stays owned by this event across retries; concurrent producers cannot steal it.
        queue.offer(new Pending(pending.row(),pending.event(),pending.size(),pending.enqueued(),pending.attempts()+1));
        if(closed) discardQueued("shutdown");
    }
    private int estimatedBytes(OperationEvent event) {
        int characters=0;
        for(String value:new String[]{event.eventId(),event.operationId(),event.spanId(),event.parentSpanId(),event.requestId(),
                event.sessionId(),event.stage(),event.source(),event.startedAt(),event.outcome(),event.reason(),
                event.serviceSource(),event.providerType(),event.model(),event.appVersion()}) if(value!=null) characters+=value.length();
        // Conservative UTF-8/record/metadata overhead; raw data stays immutable until background encoding.
        return 1024+characters*4;
    }
    private OperationsEventRow stored(Pending pending) {
        var row=pending.row();
        try {
            return new OperationsEventRow(row.eventId(),row.operationId(),row.userId(),row.stage(),row.source(),
                    row.providerType(),row.outcome(),row.durationMs(),row.model(),row.appVersion(),row.sessionId(),
                    row.startedAt(),json.writeValueAsString(pending.event()),row.serverOnly(),row.tokenSample());
        } catch(com.fasterxml.jackson.core.JsonProcessingException error) {throw new IllegalStateException("Operation encoding failed",error);}
    }
    private java.util.List<String> providers(String stage) {
        if("retrieval.rag".equals(stage)) return java.util.List.of("pg");
        if("retrieval.web".equals(stage)) return java.util.List.of("tavily");
        if("retrieval.embedding".equals(stage)||stage.startsWith("llm.")) return java.util.List.of("llm");
        if("retrieval.database".equals(stage)) return java.util.List.of("pg");
        if(stage.startsWith("asr.")) return java.util.List.of("asr");
        return java.util.List.of("system");
    }
    public void failure() {failures.increment();metrics.counter("operations.monitor.failures").increment();}
    public void drop(long count) {drop(count,"client_reported");}
    private void drop(long count,String reason) {
        if(count<=0) return;
        dropped.add(count);dropReasons.computeIfAbsent(reason,key -> new LongAdder()).add(count);
        metrics.counter("operations.events.dropped","reason",reason).increment(count);
    }
    public Map<String,Object> queue() {
        long value=budget.get();Flight current=flight.get();Pending first=queue.peek();
        long oldest=first==null?current.oldest():current.oldest()==0?first.enqueued():Math.min(first.enqueued(),current.oldest());
        return Map.of("size",(int)(value>>>32),"bytes",value&0xffffffffL,"inFlightSize",current.size(),
                "inFlightBytes",current.bytes(),"dropped",dropped.sum(),"oldestAgeMs",oldest==0?0:Math.max(0,(System.nanoTime()-oldest)/1_000_000));
    }
    public Map<String,Object> telemetry() {
        var reasons=new java.util.LinkedHashMap<String,Long>();dropReasons.forEach((key,value) -> reasons.put(key,value.sum()));
        return Map.of("accepted",accepted.sum(),"dropped",dropped.sum(),"clientReported",client.sum(),
                "serverOnly",server.sum(),"monitorFailures",failures.sum(),"dropReasons",reasons);
    }
    private void discardQueued(String reason) {
        Pending pending;while((pending=queue.poll())!=null) {release(pending.size());drop(1,reason);}
    }
    @PreDestroy public void close() {closed=true;discardQueued("shutdown");seen.clear();seenOrder.clear();}
    private record Pending(OperationsEventRow row,OperationEvent event,int size,long enqueued,int attempts) {}
    private record Flight(int size,long bytes,long oldest) {}
    private record Seen(String key,long nanos) {}
}
