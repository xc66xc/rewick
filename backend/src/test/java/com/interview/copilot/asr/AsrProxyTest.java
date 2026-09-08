package com.interview.copilot.asr;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.ai.ProviderJson;
import com.interview.copilot.ai.ProviderProperties;
import com.interview.copilot.auth.UserPrincipal;
import com.interview.copilot.config.PlatformLimitsProperties;
import com.interview.copilot.usage.UsageLease;
import com.interview.copilot.usage.UsageService;
import io.netty.handler.codec.http.websocketx.BinaryWebSocketFrame;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import java.nio.ByteBuffer;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import reactor.core.publisher.Mono;
import reactor.core.publisher.Sinks;
import reactor.netty.DisposableServer;
import reactor.netty.http.server.HttpServer;

class AsrProxyTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final ProviderJson json = new ProviderJson(mapper);
    private final ProviderProperties settings = new ProviderProperties();
    private final UsageService usage = mock(UsageService.class);
    private final UsageLease lease = mock(UsageLease.class);
    private final BlockingQueue<String> events = new ArrayBlockingQueue<>(32);
    private final AtomicReference<JsonNode> upstreamRequest = new AtomicReference<>();
    private final AtomicReference<String> authorization = new AtomicReference<>();
    private final AtomicInteger audioBytes = new AtomicInteger();
    private final CountDownLatch disconnected = new CountDownLatch(1);
    private DisposableServer server;
    private AsrProxy proxy;
    private WebSocketSession session;

    @BeforeEach void setUp() throws Exception {
        when(usage.start(anyLong(), anyString(), anyString())).thenReturn(lease);
        server = fakeServer();
        settings.getAsr().setUrl("ws://127.0.0.1:" + server.port() + "/asr");
        settings.getAsr().setApiKey("server-secret");
        settings.getAsr().setModel("server-asr-model");
        proxy = new AsrProxy(settings, json, usage, new PlatformLimitsProperties(100, 300, 3600));
        session = session("first");
        proxy.afterConnectionEstablished(session);
    }

    @AfterEach void cleanUp() {
        if (proxy != null) { proxy.shutdown(); }
        if (server != null) { server.disposeNow(); }
    }

    @Test
    void session_rebuildsRunTask_andPreservesOnlyCaptionEvents() throws Exception {
        proxy.handleTextMessage(session, new TextMessage(run(16000)));
        String started = next();
        String caption = next();
        proxy.handleBinaryMessage(session, new BinaryMessage(ByteBuffer.wrap(new byte[3200])));
        proxy.handleTextMessage(session, new TextMessage(finish()));
        String finished = next();

        assertThat(started).contains("task-started", "client-task");
        assertThat(caption).contains("result-generated", "caption").doesNotContain("provider-secret", "debug", "reasoning");
        assertThat(finished).contains("task-finished", "client-task");
        assertThat(upstreamRequest.get().path("payload").path("model").asText()).isEqualTo("server-asr-model");
        assertThat(upstreamRequest.get().path("header").path("task_id").asText()).isNotEqualTo("client-task");
        assertThat(authorization.get()).isEqualTo("Bearer server-secret");
        assertThat(audioBytes.get()).isEqualTo(3200);
        assertThat(disconnected.await(3, TimeUnit.SECONDS)).isTrue();
        verify(lease).complete();
    }

    @Test
    void session_clientDisconnect_abortsUpstreamAndCancelsUsage() throws Exception {
        proxy.handleTextMessage(session, new TextMessage(run(16000)));
        next();
        next();

        proxy.afterConnectionClosed(session, CloseStatus.NORMAL);

        assertThat(disconnected.await(3, TimeUnit.SECONDS)).isTrue();
        verify(lease).cancel();
    }

    @Test
    void session_maximumDuration_terminatesAndReleasesUsage() throws Exception {
        settings.getAsr().setMaxDurationSeconds(1);
        proxy.handleTextMessage(session, new TextMessage(run(16000)));
        next();
        next();

        assertThat(next()).contains("task-failed", "PLATFORM_ASR_ERROR");
        assertThat(disconnected.await(3, TimeUnit.SECONDS)).isTrue();
        verify(lease).fail();
    }

    @Test
    void session_wrongSampleRate_rejectsBeforeOpeningUpstream() throws Exception {
        proxy.handleTextMessage(session, new TextMessage(run(48000)));

        assertThat(next()).contains("task-failed");
        assertThat(upstreamRequest.get()).isNull();
    }

    @Test
    void session_secondConnectionForSameUser_isRejected() throws Exception {
        WebSocketSession duplicate = session("second");

        proxy.afterConnectionEstablished(duplicate);

        verify(duplicate).close(CloseStatus.POLICY_VIOLATION);
    }

    @Test
    void session_oddPcmFrame_failsSafely() throws Exception {
        proxy.handleTextMessage(session, new TextMessage(run(16000)));
        next();
        next();

        proxy.handleBinaryMessage(session, new BinaryMessage(ByteBuffer.wrap(new byte[3])));

        assertThat(next()).contains("task-failed");
        verify(lease).fail();
    }

    @Test
    void session_configurationChangesDuringReservation_preservesCapturedRouteAndCredentials() throws Exception {
        when(usage.start(anyLong(), anyString(), anyString())).thenAnswer(call -> {
            settings.getAsr().setUrl("ws://127.0.0.1:1/replacement");
            settings.getAsr().setApiKey("replacement-secret");
            settings.getAsr().setModel("replacement-model");
            return lease;
        });

        proxy.handleTextMessage(session, new TextMessage(run(16000)));
        assertThat(next()).contains("task-started");
        assertThat(next()).contains("caption");
        proxy.handleTextMessage(session, new TextMessage(finish()));

        assertThat(next()).contains("task-finished");
        assertThat(authorization.get()).isEqualTo("Bearer server-secret");
        assertThat(upstreamRequest.get().path("payload").path("model").asText()).isEqualTo("server-asr-model");
        assertThat(disconnected.await(3, TimeUnit.SECONDS)).isTrue();
        verify(lease).complete();
    }

    @Test
    void session_slowFinalization_acknowledgesOnlyAfterReservationReleaseAndCanRestartImmediately() throws Exception {
        CountDownLatch finalizing = new CountDownLatch(1);
        CountDownLatch continueFinalization = new CountDownLatch(1);
        AtomicBoolean reserved = new AtomicBoolean();
        AtomicInteger reservations = new AtomicInteger();
        UsageLease restartedLease = mock(UsageLease.class);
        when(usage.start(anyLong(), anyString(), anyString())).thenAnswer(call -> {
            if (!reserved.compareAndSet(false, true)) { throw new IllegalStateException("Previous reservation remains active"); }
            return reservations.getAndIncrement() == 0 ? lease : restartedLease;
        });
        doAnswer(call -> {
            finalizing.countDown();
            if (!continueFinalization.await(5, TimeUnit.SECONDS)) { throw new IllegalStateException("Finalization gate timed out"); }
            reserved.set(false);
            return null;
        }).when(lease).complete();
        try {
            proxy.handleTextMessage(session, new TextMessage(run(16000)));
            assertThat(next()).contains("task-started");
            assertThat(next()).contains("caption");
            proxy.handleTextMessage(session, new TextMessage(finish()));
            assertThat(finalizing.await(3, TimeUnit.SECONDS)).isTrue();
            assertThat(events).isEmpty();
            continueFinalization.countDown();
            assertThat(next()).contains("task-finished");
            WebSocketSession restarted = session("restarted");
            proxy.afterConnectionEstablished(restarted);
            proxy.handleTextMessage(restarted, new TextMessage(run(16000)));
            assertThat(next()).contains("task-started");
            assertThat(next()).contains("caption");
            proxy.handleTextMessage(restarted, new TextMessage(finish()));
            assertThat(next()).contains("task-finished");
            assertThat(reservations).hasValue(2);
            verify(restartedLease).complete();
        } finally { continueFinalization.countDown(); }
    }

    @Test
    void session_finalizationFailure_reportsFailureInsteadOfSuccessfulCompletion() throws Exception {
        doThrow(new IllegalStateException("private database detail")).when(lease).complete();
        proxy.handleTextMessage(session, new TextMessage(run(16000)));
        assertThat(next()).contains("task-started");
        assertThat(next()).contains("caption");

        proxy.handleTextMessage(session, new TextMessage(finish()));

        assertThat(next()).contains("task-failed", "PLATFORM_ASR_ERROR").doesNotContain("task-finished", "private database detail");
        verify(lease).complete();
    }

    private WebSocketSession session(String id) throws Exception {
        WebSocketSession value = mock(WebSocketSession.class);
        AtomicBoolean open = new AtomicBoolean(true);
        when(value.getId()).thenReturn(id);
        when(value.getPrincipal()).thenReturn(new UserPrincipal(1, "test"));
        when(value.getHandshakeHeaders()).thenReturn(new HttpHeaders());
        when(value.isOpen()).thenAnswer(call -> open.get());
        doAnswer(call -> { events.add(((TextMessage) call.getArgument(0)).getPayload()); return null; }).when(value).sendMessage(any());
        doAnswer(call -> { open.set(false); return null; }).when(value).close(any(CloseStatus.class));
        return value;
    }

    private DisposableServer fakeServer() {
        return HttpServer.create().port(0).handle((request, response) -> {
            authorization.set(request.requestHeaders().get("Authorization"));
            return response.sendWebsocket((input, output) -> {
                Sinks.Many<String> replies = Sinks.many().unicast().onBackpressureBuffer(new ArrayBlockingQueue<>(16));
                input.withConnection(connection -> connection.onDispose().doFinally(signal -> disconnected.countDown()).subscribe());
                Mono<Void> receive = input.receiveFrames().doOnNext(frame -> {
                    if (frame instanceof TextWebSocketFrame text) { reply(text.text(), replies); }
                    if (frame instanceof BinaryWebSocketFrame binary) { audioBytes.addAndGet(binary.content().readableBytes()); }
                }).then();
                return Mono.when(receive, output.sendString(replies.asFlux()).then());
            });
        }).bindNow();
    }

    private void reply(String text, Sinks.Many<String> replies) {
        JsonNode request = json.parse(text);
        String id = request.path("header").path("task_id").asText();
        if ("run-task".equals(request.path("header").path("action").asText())) {
            upstreamRequest.set(request);
            replies.tryEmitNext(event("task-started", id, Map.of()));
            replies.tryEmitNext(event("result-generated", id, Map.of("output", Map.of("sentence", Map.of(
                    "text", "caption", "begin_time", 0, "end_time", 100, "sentence_end", true, "reasoning", "provider-secret")))));
        } else { replies.tryEmitNext(event("task-finished", id, Map.of())); }
    }

    private String event(String event, String id, Map<String, Object> payload) {
        return json.encode(Map.of("header", Map.of("task_id", id, "event", event, "debug", "provider-secret"), "payload", payload));
    }

    private String run(int sampleRate) {
        return json.encode(Map.of("header", Map.of("action", "run-task", "task_id", "client-task", "streaming", "duplex"),
                "payload", Map.of("model", "client-unapproved-model", "parameters", Map.of("format", "pcm", "sample_rate", sampleRate), "input", Map.of())));
    }

    private String finish() { return json.encode(AsrProtocol.finish("client-task")); }
    private String next() throws InterruptedException { return events.poll(5, TimeUnit.SECONDS); }
}
