package com.interview.copilot.security.mockinterview;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.auth.SessionGuardService;
import com.interview.copilot.service.mockinterview.MockInterviewService;
import com.interview.copilot.service.mockinterview.MockSpeechService;
import com.interview.copilot.service.platform.PlatformRuntimeService;
import com.interview.copilot.util.ai.ProviderJson;
import com.interview.copilot.util.mockinterview.MockAudioCodec;
import java.util.Map;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class MockSocketSessionTest {
    private final ProviderJson json=new ProviderJson(new ObjectMapper());
    @Test void speechDeliveryUsesCreditDurableBudgetAndNeverOpensMicrophoneBeforePlaybackAck() throws Exception {
        var interviews=mock(MockInterviewService.class);var speech=mock(MockSpeechService.class);
        var platforms=mock(PlatformRuntimeService.class);var auth=mock(SessionGuardService.class);
        var resources=new MockInterviewSocket(interviews,speech,platforms,auth,json);
        UUID id=UUID.randomUUID(),turn=UUID.randomUUID();
        JsonNode state=json.parse(json.encode(Map.of("id",id,"state","speaking","generation",1,"version",2,"currentTurnId",turn,"voiceId","voice","turns",List.of(Map.of("id",turn,"question","请介绍你的项目。")))));
        when(interviews.get(1,id)).thenReturn(state);
        when(interviews.command(eq(1L),eq(id),any())).thenReturn(state);
        when(interviews.runtime(1,id)).thenReturn(json.parse("{}"));
        when(interviews.reserveSpeech(eq(1L),eq(id),eq(1),anyInt())).thenReturn(true);
        doAnswer(input->{java.util.function.Consumer<byte[]> sink=input.getArgument(3);sink.accept(new byte[]{1,2,3,4});return null;}).when(speech).stream(any(),anyString(),anyString(),any(),any());
        var socket=mock(WebSocketSession.class);when(socket.isOpen()).thenReturn(true);when(socket.getId()).thenReturn("fixture-socket");
        var connection=new AtomicReference<MockSocketSession>();var messages=new CopyOnWriteArrayList<WebSocketMessage<?>>();var finished=new CountDownLatch(1);
        doAnswer(input->{
            WebSocketMessage<?> message=input.getArgument(0);messages.add(message);
            if(message instanceof TextMessage text) {
                var event=json.parse(text.getPayload());
                if(event.path("kind").asText().equals("speech.start"))connection.get().text(json.encode(Map.of("kind","playback.credit","generation",1,"speechId",event.at("/payload/speechId").asText(),"bytes",96000)));
                if(event.path("kind").asText().equals("speech.end"))finished.countDown();
            }
            return null;
        }).when(socket).sendMessage(any());
        var session=new MockSocketSession(resources,socket,new UserPrincipal(1,"synthetic"),id,()->{});connection.set(session);
        try {
            session.start();assertThat(finished.await(5,TimeUnit.SECONDS)).isTrue();
            var frames=messages.stream().filter(BinaryMessage.class::isInstance).map(BinaryMessage.class::cast).toList();
            assertThat(frames).hasSize(1);
            assertThat(MockAudioCodec.decode(frames.getFirst().getPayload(),1).pcm()).containsExactly(1,2,3,4);
            var events=messages.stream().filter(TextMessage.class::isInstance).map(TextMessage.class::cast).map(message->json.parse(message.getPayload())).toList();
            assertThat(events.getFirst().path("kind").asText()).isEqualTo("state");
            assertThat(events.stream().map(event->event.path("sequence").asLong())).isSorted().doesNotHaveDuplicates();
            verify(interviews).reserveSpeech(1,id,1,"请介绍你的项目。".length());
            verifyNoInteractions(platforms);
            verify(interviews,never()).pause(anyLong(),any(),anyString());
        } finally {session.close(false);resources.shutdown();}
    }
}
