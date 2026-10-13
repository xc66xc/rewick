package com.interview.copilot.common.operations;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.util.ai.ProviderJson;
import reactor.core.publisher.Flux;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/** One event at the first actual content and one terminal event; never one event per token. */
public final class LlmObservation {
    private final OperationContext context;
    private final ProviderJson json;
    private final AtomicBoolean first=new AtomicBoolean();
    private final AtomicBoolean done=new AtomicBoolean();
    private final Map<String,Object> metadata=new java.util.concurrent.ConcurrentHashMap<>();
    private volatile long previousNanos;
    private volatile double maximumGap;
    public LlmObservation(OperationContext context,ProviderJson json) {this.context=context;this.json=json;}
    public Flux<String> stream(Flux<String> source) {
        if(context==null) return source;
        return source.doOnNext(value -> {
            if("[DONE]".equals(value)) {done.set(true);return;}
            inspect(json.parse(value));
        }).doOnError(error -> finish(isTimeout(error)?"timeout":"error"))
          .doFinally(signal -> finish(done.get()?"success":signal==reactor.core.publisher.SignalType.CANCEL?"cancelled":"error"));
    }
    public void inspect(JsonNode node) {
        if(context==null || context.ended().get()) return;
        usage(node.path("usage"));
        if(!node.path("choices").path(0).path("delta").path("content").asText("").isBlank()) content();
    }
    public Flux<String> lifecycle(Flux<String> source) {
        if(context==null) return source;
        return source.doOnNext(value -> {if("[DONE]".equals(value)) done.set(true);})
                .doOnError(error -> finish(isTimeout(error)?"timeout":"error"))
                .doFinally(signal -> finish(done.get()?"success":signal==reactor.core.publisher.SignalType.CANCEL?"cancelled":"error"));
    }
    public void single(Map<String,Object> value) {
        if(context==null) return;
        var response=json.parse(json.encode(value));usage(response.path("usage"));
        if(!response.path("choices").path(0).path("message").path("content").asText("").isBlank()) content();
        finish("success");
    }
    private void content() {
        long now=System.nanoTime();
        if(previousNanos!=0) maximumGap=Math.max(maximumGap,(now-previousNanos)/1_000_000.0);
        previousNanos=now;
        if(first.compareAndSet(false,true)) context.point("llm.first_content",Map.of());
    }
    private void usage(JsonNode usage) {
        for(var pair:Map.of("prompt_tokens","inputTokens","completion_tokens","outputTokens","total_tokens","totalTokens").entrySet()) {
            JsonNode value=usage.path(pair.getKey());
            if(value.isIntegralNumber() && value.asLong()>=0 && value.asLong()<=1_000_000_000) metadata.put(pair.getValue(),value.asLong());
        }
    }
    public void finish(String outcome) {
        if(context!=null) {metadata.put("maxGapMs",maximumGap);context.finish("llm.complete",outcome,Map.copyOf(metadata));}
    }
    private boolean isTimeout(Throwable error) {
        for(Throwable cause=error;cause!=null;cause=cause.getCause()) if(cause instanceof java.util.concurrent.TimeoutException) return true;
        return false;
    }
}
