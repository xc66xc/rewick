package com.interview.copilot.security.mockinterview;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.util.ai.ProviderJson;
import io.netty.handler.codec.http.websocketx.BinaryWebSocketFrame;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import java.net.http.HttpClient;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import reactor.netty.http.server.HttpServer;
import static org.assertj.core.api.Assertions.*;

class MockAsrConnectionTest {
    private final ProviderJson json=new ProviderJson(new ObjectMapper());
    @Test void realSupplierConnectionForwardsPcmAndNormalizesFinalTranscript() throws Exception {
        var bytes=new AtomicInteger();var task=new java.util.concurrent.atomic.AtomicReference<String>();
        var transcript=new CompletableFuture<JsonNode>();var failure=new CompletableFuture<Throwable>();
        var server=HttpServer.create().host("127.0.0.1").port(0).handle((request,response)->response.sendWebsocket((in,out)->out.sendString(in.aggregateFrames().receiveFrames().map(frame->{
            if(frame instanceof BinaryWebSocketFrame binary) {
                bytes.addAndGet(binary.content().readableBytes());
                return json.encode(Map.of("header",Map.of("task_id",task.get(),"event","result-generated"),"payload",Map.of("output",Map.of("sentence",Map.of("text","我负责检索服务。","begin_time",100,"end_time",500)))));
            }
            var input=json.parse(((TextWebSocketFrame)frame).text());task.set(input.at("/header/task_id").asText());
            assertThat(input.at("/payload/parameters/sample_rate").asInt()).isEqualTo(16000);
            return json.encode(Map.of("header",Map.of("task_id",task.get(),"event","task-started")));
        })).then())).bindNow();
        var config=new ProviderProperties.Asr();config.setUrl("ws://127.0.0.1:"+server.port()+"/asr");config.setApiKey("synthetic");config.setModel("fixture-asr");
        var connection=new MockAsrConnection(config,json,transcript::complete,failure::complete);
        var client=HttpClient.newHttpClient();
        try {
            connection.connect(client,config);connection.send(new byte[640]);
            var value=transcript.get(5,TimeUnit.SECONDS);
            assertThat(value.path("text").asText()).isEqualTo("我负责检索服务。");
            assertThat(value.path("isFinal").asBoolean()).isTrue();
            assertThat(value.path("startMs").asInt()).isEqualTo(100);
            assertThat(bytes).hasValue(640);
            connection.close();assertThat(failure).isNotDone();
        } finally {connection.close();client.shutdownNow();server.disposeNow();}
    }
    @Test void heartbeatTextDoesNotBecomeCandidateAnswer() {
        var config=new ProviderProperties.Asr();config.setModel("fixture-asr");
        var received=new AtomicInteger();var connection=new MockAsrConnection(config,json,node->received.incrementAndGet(),error->{});
        var socket=org.mockito.Mockito.mock(java.net.http.WebSocket.class);
        connection.onText(socket,"{\"header\":{\"event\":\"result-generated\"},\"payload\":{\"output\":{\"sentence\":{\"text\":\"ignored\",\"heartbeat\":true}}}}",true);
        assertThat(received).hasValue(0);connection.close();
    }
}
