package com.interview.copilot.common.payment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.common.platform.PlatformRuntimeFixture;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.service.background.BackgroundService;
import com.interview.copilot.service.mockinterview.*;
import com.interview.copilot.service.platform.PlatformRuntimeService;
import com.interview.copilot.util.mockinterview.MockAudioCodec;
import io.netty.handler.codec.http.websocketx.BinaryWebSocketFrame;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import reactor.netty.http.server.HttpServer;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

/** Real Spring auth/WS + PG wallet/state + real ASR transport; synthetic local suppliers only. */
class MockAudioIntegrationTest extends PaymentHttpFixture {
    @Autowired ObjectMapper json;
    @Autowired MockConfigService configs;
    @Autowired MockWalletService wallets;
    @Autowired MockInterviewService interviews;
    @Autowired BackgroundService backgrounds;
    @LocalServerPort int port;
    @MockitoBean MockProviderService provider;
    @MockitoBean MockSpeechService speech;
    @MockitoBean(extraInterfaces=com.interview.copilot.service.platform.PlatformConfigService.class) PlatformRuntimeService platforms;

    @Test void authenticatedRoundtripChargesOnlyMockAndWaitsForAsrReadiness() throws Exception {
        var task=new AtomicReference<String>();
        var asr=HttpServer.create().host("127.0.0.1").port(0).handle((request,response)->response.sendWebsocket((in,out)->out.sendString(in.aggregateFrames().receiveFrames().map(frame->{
            try {
                if(frame instanceof BinaryWebSocketFrame binary) {
                    assertThat(binary.content().readableBytes()).isEqualTo(640);
                    return json.writeValueAsString(Map.of("header",Map.of("task_id",task.get(),"event","result-generated"),"payload",Map.of("output",Map.of("sentence",Map.of("text","我实现了检索服务。","begin_time",0,"sentence_end",true)))));
                }
                task.set(json.readTree(((TextWebSocketFrame)frame).text()).at("/header/task_id").asText());
                return json.writeValueAsString(Map.of("header",Map.of("task_id",task.get(),"event","task-started")));
            } catch(Exception error) {throw new IllegalStateException(error);}
        })).then())).bindNow();
        var properties=new ProviderProperties();properties.getAsr().setUrl("ws://127.0.0.1:"+asr.port()+"/asr");properties.getAsr().setApiKey("synthetic");properties.getAsr().setModel("fixture-asr");
        when(platforms.snapshot()).thenReturn(new PlatformRuntimeFixture(properties).snapshot());
        when(provider.completion(anyLong(),anyString(),anyString(),any(),anyInt())).thenAnswer(input->json.readTree(((String)input.getArgument(2)).contains("规划器")?"{\"topics\":[{\"id\":\"intro\",\"objective\":\"经历\"},{\"id\":\"design\",\"objective\":\"设计\"}]}":"{\"action\":\"next_topic\",\"speechText\":\"请介绍你的项目。\",\"topicId\":\"intro\"}"));
        doAnswer(input->{java.util.function.Consumer<byte[]> sink=input.getArgument(3);sink.accept(new byte[]{1,2,3,4});return null;}).when(speech).stream(any(),anyString(),anyString(),any(),any());
        ObjectNode settings=(ObjectNode)configs.get();settings.put("enabled",true).put("llmModelId","fixture").put("reportModelId","fixture").put("asrServiceId","environment-asr");
        ((ObjectNode)settings.path("tts")).put("endpoint","wss://example.com/tts").put("model","fixture").put("voiceId","fixture").put("apiKey","synthetic-only");configs.save(3,settings);
        var env=UUID.fromString(backgrounds.library(1).path("activeEnvironmentId").asText());var resume=UUID.randomUUID();
        jdbc.update("INSERT INTO user_resumes(id,app_users_id,content,mutation_id) VALUES(?::uuid,1,'{\"name\":\"合成简历\",\"text\":\"合成经历\"}'::jsonb,?::uuid)",resume.toString(),UUID.randomUUID().toString());
        jdbc.update("UPDATE interview_environments SET content=jsonb_set(content,'{resumeId}',to_jsonb(?::text)) WHERE id=?::uuid",resume.toString(),env.toString());
        wallets.adjust(3,1,json.valueToTree(Map.of("requestId",UUID.randomUUID(),"deltaSeconds",300,"reason","合成测试")));
        var created=interviews.create(1,json.valueToTree(Map.of("requestId",UUID.randomUUID(),"environmentId",env,"durationMinutes",15,"difficulty","standard","avatarId","rewick-interviewer","voiceId","fixture")));
        UUID id=UUID.fromString(created.path("id").asText());
        interviews.command(1,id,json.valueToTree(Map.of("requestId",UUID.randomUUID(),"expectedVersion",created.path("version").asLong(),"command","start")));
        var client=HttpClient.newHttpClient();var socketRef=new AtomicReference<WebSocket>();var played=new CompletableFuture<Void>();var ready=new CompletableFuture<JsonNode>();var transcript=new CompletableFuture<JsonNode>();var frames=new CopyOnWriteArrayList<byte[]>();
        try {
            URI uri=URI.create("ws://127.0.0.1:"+port+"/ws/v1/mock-interviews/"+id);
            assertThatThrownBy(()->client.newWebSocketBuilder().buildAsync(uri,new WebSocket.Listener(){}).get(5,TimeUnit.SECONDS)).isInstanceOf(ExecutionException.class);
            WebSocket socket=client.newWebSocketBuilder().header("Authorization","Bearer "+aliceToken).buildAsync(uri,new WebSocket.Listener(){
                final StringBuilder text=new StringBuilder();
                public void onOpen(WebSocket ws){ws.request(1);}
                public CompletionStage<?> onText(WebSocket ws,CharSequence data,boolean last){
                    try {text.append(data);if(last){var event=json.readTree(text.toString());text.setLength(0);
                        switch(event.path("kind").asText()) {
                            case "speech.start" -> ws.sendText(json.writeValueAsString(Map.of("kind","playback.credit","generation",event.path("generation").asInt(),"speechId",event.at("/payload/speechId").asText(),"bytes",96000)),true);
                            case "speech.end" -> played.complete(null);
                            case "state" -> {if(event.at("/payload/asrReady").asBoolean())ready.complete(event);}
                            case "transcript.final" -> transcript.complete(event.path("payload"));
                            case "error" -> ready.completeExceptionally(new IllegalStateException(event.toString()));
                        }}ws.request(1);
                    } catch(Exception error){ready.completeExceptionally(error);}return CompletableFuture.completedFuture(null);
                }
                public CompletionStage<?> onBinary(WebSocket ws,ByteBuffer data,boolean last){byte[] bytes=new byte[data.remaining()];data.get(bytes);frames.add(bytes);ws.request(1);return CompletableFuture.completedFuture(null);}
            }).get(5,TimeUnit.SECONDS);socketRef.set(socket);
            played.get(10,TimeUnit.SECONDS);assertThat(frames).hasSize(1);
            var state=interviews.get(1,id);
            interviews.command(1,id,json.valueToTree(Map.of("requestId",UUID.randomUUID(),"expectedVersion",state.path("version").asLong(),"turnId",state.path("currentTurnId").asText(),"command","playback_completed")));
            var event=ready.get(10,TimeUnit.SECONDS);
            byte[] mic=MockAudioCodec.encode(event.path("generation").asInt(),UUID.fromString(event.at("/payload/currentTurnId").asText()),0,new byte[640]);mic[3]=0;
            socket.sendBinary(ByteBuffer.wrap(mic),true).join();
            assertThat(transcript.get(5,TimeUnit.SECONDS).path("text").asText()).isEqualTo("我实现了检索服务。");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM time_wallet_transactions WHERE app_users_id=1 AND delta_seconds<0",Long.class)).isZero();
            state=interviews.get(1,id);interviews.command(1,id,json.valueToTree(Map.of("requestId",UUID.randomUUID(),"expectedVersion",state.path("version").asLong(),"command","finish")));
        } finally {var socket=socketRef.get();if(socket!=null)socket.abort();client.shutdownNow();asr.disposeNow();}
    }
}
