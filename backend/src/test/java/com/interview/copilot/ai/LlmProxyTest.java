package com.interview.copilot.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.auth.UserPrincipal;
import com.interview.copilot.common.ApiException;
import com.interview.copilot.usage.UsageLease;
import com.interview.copilot.usage.UsageService;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.netty.DisposableServer;
import reactor.netty.http.server.HttpServer;

class LlmProxyTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final UsageService usage = mock(UsageService.class);
    private final UsageLease lease = mock(UsageLease.class);
    private final ProviderProperties settings = new ProviderProperties();
    private DisposableServer server;
    private LlmProxy proxy;

    @BeforeEach void setUp() {
        when(usage.start(anyLong(), anyString(), anyString())).thenReturn(lease);
        settings.getLlm().setApiKey("server-only-secret");
        settings.getLlm().setModel("approved");
        proxy = new LlmProxy(settings, new ProviderHttpClient(), new ProviderJson(mapper), usage);
    }

    @AfterEach void cleanUp() {
        if (server != null) { server.disposeNow(); }
        SecurityContextHolder.clearContext();
    }

    @Test
    void execute_nonStreaming_filtersMetadataAndUsesServerKey() {
        AtomicReference<String> authorization = new AtomicReference<>();
        server = HttpServer.create().port(0).handle((request, response) -> {
            authorization.set(request.requestHeaders().get("Authorization"));
            return response.header("Content-Type", "application/json").sendString(Mono.just(
                    "{\"choices\":[{\"message\":{\"content\":\"OK\",\"reasoning_content\":\"private\"}}],\"api_key\":\"secret\",\"usage\":{\"total_tokens\":5,\"internal\":\"secret\"}}"));
        }).bindNow();
        endpoint();

        Object result = proxy.execute(1, "test-single", input(false));

        assertThat(mapper.valueToTree(result).toString()).contains("OK", "total_tokens").doesNotContain("private", "api_key", "internal");
        assertThat(authorization.get()).isEqualTo("Bearer server-only-secret");
        verify(lease).complete();
    }

    @Test
    void execute_sseEndpoint_returnsRealEvents() throws Exception {
        server = HttpServer.create().port(0).handle((request, response) -> response
                .header("Content-Type", "text/event-stream").sendString(Flux.just(delta("first"), delta("second"), "data: [DONE]\n\n")
                        .delayElements(Duration.ofMillis(80)))).bindNow();
        endpoint();
        var authentication = new UsernamePasswordAuthenticationToken(new UserPrincipal(1, "test"), null, List.of());
        SecurityContextHolder.getContext().setAuthentication(authentication);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new LlmController(proxy))
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver()).build();

        MvcResult started = mvc.perform(post("/api/v1/llm/chat/completions").contentType(MediaType.APPLICATION_JSON)
                .content(input(true).toString())).andExpect(request().asyncStarted()).andReturn();
        started.getAsyncResult(5000);
        String response = mvc.perform(asyncDispatch(started)).andReturn().getResponse().getContentAsString();

        assertThat(response).contains("data:", "first", "second", "[DONE]").doesNotContain("secret_metadata");
        verify(lease).complete();
    }

    @Test
    void stream_firstChunkArrivesBeforeEnd_andCancellationClosesUpstream() throws InterruptedException {
        CountDownLatch cancelled = new CountDownLatch(1);
        server = HttpServer.create().port(0).handle((request, response) -> response
                .header("Content-Type", "text/event-stream").sendString(Flux.just(delta("early"))
                        .concatWith(Mono.delay(Duration.ofSeconds(10)).map(value -> "data: [DONE]\n\n"))
                        .doOnCancel(cancelled::countDown))).bindNow();
        endpoint();

        String first = proxy.stream(settings.getLlm(), Map.of()).next().block(Duration.ofSeconds(3));

        assertThat(first).contains("early");
        assertThat(cancelled.await(3, TimeUnit.SECONDS)).isTrue();
    }

    @Test
    void stream_idleTimeout_failsSafely() {
        settings.getLlm().setIdleTimeoutSeconds(1);
        server = HttpServer.create().port(0).handle((request, response) -> response
                .header("Content-Type", "text/event-stream").sendString(Flux.never())).bindNow();
        endpoint();

        assertThatThrownBy(() -> proxy.stream(settings.getLlm(), Map.of()).collectList().block(Duration.ofSeconds(4)))
                .isInstanceOf(ApiException.class).hasMessage("服务暂时不可用，请稍后重试");
    }

    @Test
    void stream_continuousChunks_cannotBypassTotalDeadline() {
        settings.getLlm().setTotalTimeoutSeconds(1);
        server = HttpServer.create().port(0).handle((request, response) -> response
                .header("Content-Type", "text/event-stream").sendString(Flux.interval(Duration.ofMillis(50))
                        .map(value -> delta("chunk")))).bindNow();
        endpoint();

        assertThatThrownBy(() -> proxy.stream(settings.getLlm(), Map.of()).collectList().block(Duration.ofSeconds(4)))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void stream_oversizedEvent_failsBeforeAccumulatingUnlimitedData() {
        server = HttpServer.create().port(0).handle((request, response) -> response
                .header("Content-Type", "text/event-stream").sendString(Mono.just(delta("x".repeat(100000))))).bindNow();
        endpoint();

        assertThatThrownBy(() -> proxy.stream(settings.getLlm(), Map.of()).collectList().block(Duration.ofSeconds(4)))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void execute_redirect_neverFollowsAndReturnsSafeError() {
        server = HttpServer.create().port(0).handle((request, response) -> response.status(302)
                .header("Location", "https://secret-exfiltration.invalid/").sendString(Mono.just("secret-debug"))).bindNow();
        endpoint();

        assertThatThrownBy(() -> proxy.execute(1, "redirect", input(false)))
                .isInstanceOf(ApiException.class).hasMessage("服务暂时不可用，请稍后重试");
        verify(lease).fail();
    }

    @Test
    void execute_configurationChangesDuringReservation_usesOriginalEndpointKeyAndModel() {
        AtomicReference<String> authorization = new AtomicReference<>();
        AtomicReference<String> body = new AtomicReference<>();
        server = HttpServer.create().port(0).handle((request, response) -> {
            authorization.set(request.requestHeaders().get("Authorization"));
            return response.header("Content-Type", "application/json").sendString(request.receive().aggregate().asString()
                    .map(input -> { body.set(input); return "{\"choices\":[{\"message\":{\"content\":\"original\"}}]}"; }));
        }).bindNow();
        endpoint();
        when(usage.start(anyLong(), anyString(), anyString())).thenAnswer(call -> {
            settings.getLlm().setUrl("http://127.0.0.1:1/replacement");
            settings.getLlm().setApiKey("replacement-secret");
            settings.getLlm().setModel("replacement-model");
            return lease;
        });

        Object result = proxy.execute(1, "snapshot", input(false));

        assertThat(result.toString()).contains("original");
        assertThat(authorization.get()).isEqualTo("Bearer server-only-secret");
        assertThat(body.get()).contains("\"model\":\"approved\"").doesNotContain("replacement");
    }

    private void endpoint() { settings.getLlm().setUrl("http://127.0.0.1:" + server.port() + "/completions"); }

    private com.fasterxml.jackson.databind.JsonNode input(boolean stream) {
        return mapper.valueToTree(Map.of("stream", stream, "messages", List.of(Map.of("role", "user", "content", "hi"))));
    }

    private String delta(String content) {
        return "data: {\"choices\":[{\"delta\":{\"content\":\"" + content + "\"}}],\"secret_metadata\":\"hidden\"}\n\n";
    }
}
