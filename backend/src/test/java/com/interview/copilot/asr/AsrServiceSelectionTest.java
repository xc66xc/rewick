package com.interview.copilot.asr;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.ai.ProviderJson;
import com.interview.copilot.ai.ProviderProperties;
import com.interview.copilot.auth.UserPrincipal;
import com.interview.copilot.common.ApiException;
import com.interview.copilot.config.PlatformLimitsProperties;
import com.interview.copilot.usage.UsageLease;
import com.interview.copilot.usage.UsageService;
import java.net.URI;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpHeaders;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import reactor.netty.DisposableServer;
import reactor.netty.http.server.HttpServer;

class AsrServiceSelectionTest {
    private final ProviderJson json = new ProviderJson(new ObjectMapper());
    private final ProviderProperties settings = new ProviderProperties();
    private final UsageService usage = mock(UsageService.class);
    private final UsageLease lease = mock(UsageLease.class);
    private final BlockingQueue<String> events = new ArrayBlockingQueue<>(8);
    private final AtomicInteger supplierCalls = new AtomicInteger();
    private final AtomicReference<String> supplierUri = new AtomicReference<>();
    private DisposableServer server;
    private AsrProxy proxy;

    @BeforeEach void setUp() {
        when(usage.start(anyLong(), anyString(), anyString())).thenReturn(lease);
        server = HttpServer.create().port(0).handle((request, response) -> {
            supplierCalls.incrementAndGet();
            supplierUri.set(request.uri());
            return response.sendWebsocket((input, output) -> output.sendString(input.receive().asString().map(this::reply)).then());
        }).bindNow();
        settings.getAsr().setUrl("ws://127.0.0.1:" + server.port() + "/asr?mode=manual");
        settings.getAsr().setApiKey("fixture-secret");
        settings.getAsr().setModel("fixture-transcriber");
        proxy = new AsrProxy(settings, json, usage, new PlatformLimitsProperties(3600));
    }

    @AfterEach void close() {
        proxy.shutdown();
        server.disposeNow();
    }

    @Test void selection_absentQuery_preservesLegacyBehavior() {
        assertThat(AsrServiceSelection.from(URI.create("ws://localhost/api/v1/asr"))).isNull();
        assertThat(AsrServiceSelection.from(null)).isNull();
    }

    @Test void selection_encodedIdentifier_decodesBeforeMatching() {
        assertThat(AsrServiceSelection.from(URI.create("ws://localhost/api/v1/asr?serviceId=environment%2Dasr")))
                .isEqualTo("environment-asr");
    }

    @ParameterizedTest
    @ValueSource(strings = {"?serviceId=", "?serviceId", "?serviceId=a&serviceId=b", "?serviceId=bad%2Fid"})
    void selection_malformedOrDuplicateQuery_isRejected(String query) {
        assertThatThrownBy(() -> proxy.checkAvailable(URI.create("ws://localhost/api/v1/asr" + query)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("INVALID_AI_REQUEST");
        assertThat(supplierCalls).hasValue(0);
    }

    @Test void session_staleSelection_rejectsBeforeOpeningSupplier() throws Exception {
        WebSocketSession session = session("?serviceId=retired-asr");
        assertThatThrownBy(() -> proxy.checkAvailable(session.getUri())).isInstanceOf(ApiException.class)
                .extracting("code").isEqualTo("SERVICE_UNAVAILABLE");

        proxy.afterConnectionEstablished(session);
        proxy.handleTextMessage(session, new TextMessage(run()));

        verify(session).close(CloseStatus.POLICY_VIOLATION);
        assertThat(supplierCalls).hasValue(0);
        verifyNoInteractions(usage);
    }

    @ParameterizedTest @ValueSource(strings = {"", "?serviceId=environment-asr"})
    void session_currentOrUnspecifiedSelection_runsBoundServiceWithoutForwardingSelection(String query) throws Exception {
        WebSocketSession session = session(query);
        proxy.checkAvailable(session.getUri());
        proxy.afterConnectionEstablished(session);

        proxy.handleTextMessage(session, new TextMessage(run()));
        assertThat(next()).contains("task-started");
        proxy.handleTextMessage(session, new TextMessage(json.encode(AsrProtocol.finish("fixture-task"))));

        assertThat(next()).contains("task-finished");
        assertThat(supplierCalls).hasValue(1);
        assertThat(supplierUri).hasValue("/asr?mode=manual");
        verify(lease).complete();
    }

    @Test void session_serviceDisabledAfterHandshake_rechecksSelectionBeforeTaskStarts() throws Exception {
        WebSocketSession session = session("?serviceId=environment-asr");
        proxy.checkAvailable(session.getUri());
        proxy.afterConnectionEstablished(session);
        settings.getAsr().setApiKey("");

        proxy.handleTextMessage(session, new TextMessage(run()));

        assertThat(next()).contains("task-failed");
        assertThat(supplierCalls).hasValue(0);
        verifyNoInteractions(usage);
    }

    private WebSocketSession session(String query) throws Exception {
        WebSocketSession session = mock(WebSocketSession.class);
        AtomicBoolean open = new AtomicBoolean(true);
        when(session.getId()).thenReturn("selected-session");
        when(session.getUri()).thenReturn(URI.create("ws://localhost/api/v1/asr" + query));
        when(session.getPrincipal()).thenReturn(new UserPrincipal(1, "fixture-user"));
        when(session.getHandshakeHeaders()).thenReturn(new HttpHeaders());
        when(session.isOpen()).thenAnswer(call -> open.get());
        doAnswer(call -> { events.add(((TextMessage) call.getArgument(0)).getPayload()); return null; }).when(session).sendMessage(any());
        doAnswer(call -> { open.set(false); return null; }).when(session).close(any(CloseStatus.class));
        return session;
    }

    private String run() {
        return json.encode(Map.of("header", Map.of("action", "run-task", "task_id", "fixture-task", "streaming", "duplex"),
                "payload", Map.of("parameters", Map.of("format", "pcm", "sample_rate", 16000), "input", Map.of())));
    }

    private String reply(String text) {
        JsonNode frame = json.parse(text);
        String event = frame.path("header").path("action").asText().equals("run-task") ? "task-started" : "task-finished";
        return json.encode(Map.of("header", Map.of("event", event, "task_id", frame.path("header").path("task_id").asText()), "payload", Map.of()));
    }

    private String next() throws InterruptedException { return events.poll(5, TimeUnit.SECONDS); }
}
