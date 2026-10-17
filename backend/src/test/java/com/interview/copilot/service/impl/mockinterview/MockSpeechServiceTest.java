package com.interview.copilot.service.impl.mockinterview;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.util.ai.ProviderJson;
import io.netty.buffer.Unpooled;
import io.netty.handler.codec.http.websocketx.BinaryWebSocketFrame;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import io.netty.handler.codec.http.websocketx.WebSocketFrame;
import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import reactor.netty.http.server.HttpServer;
import static org.assertj.core.api.Assertions.*;

class MockSpeechServiceTest {
    private final ProviderJson json=new ProviderJson(new ObjectMapper());
    @Test void realWebSocketUsesMatchingTaskAndProducesEvenPcm() {
        var requests=new CopyOnWriteArrayList<JsonNode>();var auth=new AtomicReference<String>();
        var server=HttpServer.create().host("127.0.0.1").port(0).handle((request,response)->{
            auth.set(request.requestHeaders().get("Authorization"));
            return response.sendWebsocket((in,out)->out.sendObject(in.aggregateFrames().receiveFrames().concatMapIterable(frame->{
                var input=json.parse(((TextWebSocketFrame)frame).text());requests.add(input);
                String id=input.at("/header/task_id").asText();
                return switch(input.at("/header/action").asText()) {
                    case "run-task" -> List.<WebSocketFrame>of(event(id,"task-started"));
                    case "continue-task" -> List.<WebSocketFrame>of(new BinaryWebSocketFrame(Unpooled.wrappedBuffer(new byte[]{1,2,3})),new BinaryWebSocketFrame(Unpooled.wrappedBuffer(new byte[]{4,5,6})));
                    case "finish-task" -> List.<WebSocketFrame>of(event(id,"task-finished"));
                    default -> throw new AssertionError("Unexpected event");
                };
            })).then());
        }).bindNow();
        var service=new MockSpeechServiceImpl(json);
        try {
            var audio=new ByteArrayOutputStream();
            service.stream(config(server.port()),"请介绍你最近的项目。","fixture-voice",audio::writeBytes,()->false);
            assertThat(audio.toByteArray()).containsExactly(1,2,3,4,5,6);
            assertThat(auth).hasValue("Bearer fixture-only-secret");
            assertThat(requests).hasSize(3);
            assertThat(requests.getFirst().at("/payload/parameters/sample_rate").asInt()).isEqualTo(24000);
            assertThat(requests.get(1).at("/payload/input/text").asText()).contains("最近的项目");
            assertThat(requests.stream().map(node->node.at("/header/task_id").asText()).distinct()).hasSize(1);
        } finally {service.close();server.disposeNow();}
    }
    @Test void cancellationClosesSupplierWithoutAwaitingNinetySecondDeadline() {
        var server=HttpServer.create().host("127.0.0.1").port(0).handle((req,res)->res.sendWebsocket((in,out)->out.sendObject(in.aggregateFrames().receiveFrames().filter(frame->json.parse(((TextWebSocketFrame)frame).text()).at("/header/action").asText().equals("run-task")).map(frame->event(json.parse(((TextWebSocketFrame)frame).text()).at("/header/task_id").asText(),"task-started"))).then())).bindNow();
        var service=new MockSpeechServiceImpl(json);
        try {assertThatThrownBy(()->service.stream(config(server.port()),"测试","voice",bytes->{},()->true)).isInstanceOf(java.util.concurrent.CancellationException.class);}
        finally {service.close();server.disposeNow();}
    }
    @Test void invalidConfigurationFailsBeforeConnecting() {
        var service=new MockSpeechServiceImpl(json);
        try {assertThatThrownBy(()->service.stream(json.parse("{}"),"测试","voice",bytes->{},()->false)).isInstanceOf(ApiException.class);}
        finally {service.close();}
    }
    private TextWebSocketFrame event(String id,String event) {return new TextWebSocketFrame(json.encode(Map.of("header",Map.of("task_id",id,"event",event),"payload",Map.of())));}
    private JsonNode config(int port) {return json.parse(json.encode(Map.of("tts",Map.of("endpoint","ws://127.0.0.1:"+port+"/tts","apiKey","fixture-only-secret","model","cosyvoice-fixture","sampleRate",24000))));}
}
