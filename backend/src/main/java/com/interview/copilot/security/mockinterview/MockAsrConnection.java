package com.interview.copilot.security.mockinterview;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.model.asr.LiveTranslateSession;
import com.interview.copilot.util.ai.ProviderJson;
import com.interview.copilot.util.asr.AsrEndpoint;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/** One upstream ASR task per listening turn, with bounded frames and serialized audio writes. */
final class MockAsrConnection implements WebSocket.Listener,AutoCloseable {
    private final ProviderJson json;
    private final Consumer<JsonNode> transcript;
    private final Consumer<Throwable> failure;
    private final String taskId=UUID.randomUUID().toString();
    private final StringBuilder text=new StringBuilder();
    private final CompletableFuture<Void> ready=new CompletableFuture<>();
    private final LiveTranslateSession realtime;
    private volatile WebSocket socket;
    private volatile boolean closed;
    private volatile CompletableFuture<WebSocket> sending=CompletableFuture.completedFuture(null);
    private final java.util.concurrent.atomic.AtomicInteger pendingBytes=new java.util.concurrent.atomic.AtomicInteger();
    MockAsrConnection(ProviderProperties.Asr config,ProviderJson json,Consumer<JsonNode> transcript,Consumer<Throwable> failure) {
        this.json=json;this.transcript=transcript;this.failure=failure;
        this.realtime=LiveTranslateSession.MODEL.equals(config.getModel())?new LiveTranslateSession():null;
    }
    void connect(HttpClient client,ProviderProperties.Asr config) throws Exception {
        if(!config.isEnabled())throw new IllegalStateException("ASR unavailable");
        socket=client.newWebSocketBuilder().connectTimeout(Duration.ofSeconds(10)).header("Authorization","Bearer "+config.getApiKey())
                .buildAsync(AsrEndpoint.resolve(config.getUrl(),config.getModel()),this).get(12,TimeUnit.SECONDS);
        Object start=realtime!=null?realtime.run():Map.of("header",Map.of("action","run-task","task_id",taskId,"streaming","duplex"),"payload",Map.of(
                "task_group","audio","task","asr","function","recognition","model",config.getModel(),"parameters",Map.of(
                "format","pcm","sample_rate",16000,"semantic_punctuation_enabled",false,"max_sentence_silence",800,"heartbeat",true),"input",Map.of()));
        socket.sendText(json.encode(start),true).join();ready.get(12,TimeUnit.SECONDS);
        if(closed)throw new IllegalStateException("ASR cancelled");
    }
    public void onOpen(WebSocket webSocket){webSocket.request(1);}
    public CompletionStage<?> onText(WebSocket webSocket,CharSequence data,boolean last) {
        try{
            if(text.length()+data.length()>65536)throw new IllegalArgumentException("ASR frame too large");
            text.append(data);
            if(last){JsonNode event=json.parse(text.toString());text.setLength(0);
                if(realtime!=null){var normalized=realtime.receive(event,taskId);if(normalized.isPresent())event=normalized.get();else{webSocket.request(1);return CompletableFuture.completedFuture(null);}}
                String kind=event.path("header").path("event").asText();
                if("task-started".equals(kind))ready.complete(null);
                else if("task-failed".equals(kind)||"error".equals(event.path("type").asText()))throw new IllegalStateException("ASR supplier failed");
                else if("result-generated".equals(kind))publish(event.path("payload").path("output").path("sentence"));
            }
            webSocket.request(1);
        }catch(RuntimeException error){ready.completeExceptionally(error);if(!closed)failure.accept(error);close();}
        return CompletableFuture.completedFuture(null);
    }
    private void publish(JsonNode sentence) {
        if(closed||sentence.path("heartbeat").asBoolean()||!sentence.path("text").isTextual())return;
        String value=sentence.path("text").asText();if(value.length()>12000)throw new IllegalArgumentException("ASR text limit");
        long start=sentence.path("begin_time").asLong(0);
        boolean done=sentence.path("sentence_end").isBoolean()?sentence.path("sentence_end").asBoolean():
                sentence.path("end_time").isIntegralNumber()&&sentence.path("end_time").asLong()>=start;
        var result=json.parse(json.encode(Map.of("id",taskId+":"+start,"text",value,"isFinal",done,"startMs",Math.max(0,start))));
        transcript.accept(result);
    }
    void send(byte[] pcm){
        if(closed||socket==null||!ready.isDone())return;
        if(pendingBytes.addAndGet(pcm.length)>64000){pendingBytes.addAndGet(-pcm.length);failure.accept(new IllegalStateException("ASR backlog"));close();return;}
        sending=sending.handle((ignored,error)->socket).thenCompose(ws->{if(closed)return CompletableFuture.completedFuture(ws);
            return realtime==null?ws.sendBinary(ByteBuffer.wrap(pcm),true):ws.sendText(json.encode(realtime.audio(ByteBuffer.wrap(pcm))),true);
        }).whenComplete((ignored,error)->{pendingBytes.addAndGet(-pcm.length);if(error!=null&&!closed)failure.accept(error);});
    }
    public void onError(WebSocket webSocket,Throwable error){ready.completeExceptionally(error);if(!closed)failure.accept(error);}
    public CompletionStage<?> onClose(WebSocket webSocket,int status,String reason){if(!closed){var error=new IllegalStateException("ASR closed");ready.completeExceptionally(error);failure.accept(error);}return CompletableFuture.completedFuture(null);}
    public void close(){closed=true;var current=socket;if(current!=null)current.abort();ready.completeExceptionally(new IllegalStateException("ASR cancelled"));}
}
