package com.interview.copilot.service.impl.questions;

import com.interview.copilot.common.platform.PlatformConfigFixture;
import com.interview.copilot.common.usage.UsageLease;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.exception.ai.ProviderFailure;
import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.model.operations.OperationEvent;
import com.interview.copilot.model.platform.PlatformConfig;
import com.interview.copilot.model.platform.PlatformPolicy;
import com.interview.copilot.model.platform.PlatformSnapshot;
import com.interview.copilot.model.questions.QuestionRewriteResult;
import com.interview.copilot.request.questions.QuestionRewriteRequest;
import com.interview.copilot.service.platform.PlatformRuntimeService;
import com.interview.copilot.service.questions.QuestionRewriteAccessService;
import com.interview.copilot.service.usage.UsageService;
import com.interview.copilot.util.questions.QuestionRewriteClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import reactor.core.publisher.Mono;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class QuestionRewriteServiceTest {
    private final PlatformRuntimeService runtime = mock(PlatformRuntimeService.class);
    private final QuestionRewriteClient client = mock(QuestionRewriteClient.class);
    private final QuestionRewriteAccessService access = mock(QuestionRewriteAccessService.class);
    private final UsageService usage = mock(UsageService.class);
    private final QuestionRewriteCancellationServiceImpl cancellations = new QuestionRewriteCancellationServiceImpl();
    private final String requestId = UUID.randomUUID().toString();
    private final List<OperationEvent> events = new CopyOnWriteArrayList<>();
    private QuestionRewriteServiceImpl service;

    @BeforeEach
    void setup() {
        service = new QuestionRewriteServiceImpl(runtime, client, access, cancellations, usage);
        when(access.require(7, 70)).thenReturn("interview");
        when(usage.startForSession(7, requestId, "llm", 70)).thenReturn(new UsageLease(usage, 7, requestId, "llm", "interview"));
        when(usage.active(7, "interview")).thenReturn(true);
        when(runtime.snapshot()).thenReturn(snapshot(true));
    }

    @Test
    void rewrite_disabled_doesNotReserveUsageOrCallModel() {
        when(runtime.snapshot()).thenReturn(snapshot(false));
        var result = execute("问题");
        assertThat(result.status()).isEqualTo("skipped");
        assertThat(result.reason()).isEqualTo("disabled");
        assertThat(result.question()).isNull();
        verifyNoInteractions(client);
        verify(usage, never()).startForSession(7, requestId, "llm", 70);
    }

    @Test
    void rewrite_oversizedQuestion_skipsWholeTextWithoutCallingSupplier() {
        var result = execute("问".repeat(3001));
        assertThat(result.reason()).isEqualTo("input_limit");
        verifyNoInteractions(client);
    }

    @Test
    void rewrite_success_recordsSelectedModelAndOwnStageWithTokenUsage() {
        when(client.rewrite(any(), any(), any())).thenReturn(Mono.just(new QuestionRewriteResult("rewritten", "整理后的完整问题？", Map.of("inputTokens", 18L))));
        var result = execute("那个，完整问题");
        assertThat(result.question()).isEqualTo("整理后的完整问题？");
        assertThat(result.model()).isEqualTo("upstream-careful");
        assertThat(result.platformVersion()).isEqualTo(7);
        assertThat(events).singleElement().satisfies(event -> {
            assertThat(event.stage()).isEqualTo("question.rewrite");
            assertThat(event.model()).isEqualTo("upstream-careful");
            assertThat(event.metadata()).containsEntry("inputTokens", 18L).containsEntry("platformVersion", 7L);
        });
        verify(usage).describeModel(7, requestId, "llm", "upstream-careful");
        verify(usage).finish(eq(7L), eq(requestId), eq("llm"), eq("complete"));
    }

    @Test
    void rewrite_supplierAuthenticationFailure_degradesWithoutLeakingDetails() {
        when(client.rewrite(any(), any(), any())).thenReturn(Mono.error(ProviderFailure.http(401)));
        var result = execute("问题");
        assertThat(result.status()).isEqualTo("degraded");
        assertThat(result.reason()).isEqualTo("provider_error");
        assertThat(result.question()).isNull();
    }

    @Test
    void rewrite_invalidOutput_keepsReportedUsageInTerminalStage() {
        when(client.rewrite(any(), any(), any())).thenReturn(Mono.error(
                new com.interview.copilot.exception.questions.QuestionRewriteOutputException(
                        Map.of("inputTokens", 20L, "outputTokens", 10L, "totalTokens", 30L))));
        var result = execute("问题");
        assertThat(result.reason()).isEqualTo("invalid_output");
        assertThat(events).singleElement().satisfies(event -> {
            assertThat(event.outcome()).isEqualTo("degraded");
            assertThat(event.metadata()).containsEntry("inputTokens", 20L)
                    .containsEntry("outputTokens", 10L).containsEntry("totalTokens", 30L);
        });
    }

    @Test
    void rewrite_timeout_degradesOnceWithoutRetry() {
        when(client.rewrite(any(), any(), any())).thenReturn(Mono.error(new java.util.concurrent.TimeoutException()));
        assertThat(execute("问题").reason()).isEqualTo("timeout");
        verify(client).rewrite(any(), any(), any());
    }

    @Test
    void rewrite_expiredDesktopSession_abortsWithoutSupplierOrFallback() {
        doThrow(new ApiException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "会话失效")).when(access).require(7, 70);
        assertThatThrownBy(() -> execute("问题")).isInstanceOf(ApiException.class).hasMessage("会话失效");
        verifyNoInteractions(client);
    }

    @Test
    void rewrite_interviewEndedBeforeResult_abortsInsteadOfReturningRewrite() {
        when(client.rewrite(any(), any(), any())).thenReturn(Mono.just(new QuestionRewriteResult("unchanged", null, Map.of())));
        doThrow(new ApiException(HttpStatus.CONFLICT, "INTERVIEW_NOT_ACTIVE", "面试结束")).when(access).requireActive(7, 70, "interview");
        assertThatThrownBy(() -> execute("问题")).isInstanceOf(ApiException.class).hasMessage("面试结束");
        verify(usage, never()).finish(7, requestId, "llm", "complete");
    }

    @Test
    void rewrite_explicitCancellation_cancelsUpstreamAndDoesNotReturnFallback() throws Exception {
        var subscribed = new CountDownLatch(1);
        var stopped = new CountDownLatch(1);
        when(client.rewrite(any(), any(), any())).thenReturn(Mono.<QuestionRewriteResult>never()
                .doOnSubscribe(value -> subscribed.countDown()).doOnCancel(stopped::countDown));
        var future = service.rewrite(7, 70, requestId, new QuestionRewriteRequest("问题", List.of()), context()).toFuture();
        assertThat(subscribed.await(3, TimeUnit.SECONDS)).isTrue();
        cancellations.cancel(7, requestId);
        assertThatThrownBy(future::join).isInstanceOf(java.util.concurrent.CancellationException.class);
        assertThat(stopped.await(3, TimeUnit.SECONDS)).isTrue();
        assertThat(events).singleElement().extracting(OperationEvent::outcome).isEqualTo("cancelled");
    }

    private com.interview.copilot.response.questions.QuestionRewriteResponse execute(String question) {
        return service.rewrite(7, 70, requestId, new QuestionRewriteRequest(question, List.of()), context()).block(Duration.ofSeconds(4));
    }

    private OperationContext context() {
        return OperationContext.start(7, UUID.randomUUID().toString(), null, requestId, "interview", "llm", null, events::add);
    }

    private PlatformSnapshot snapshot(boolean enabled) {
        var base = PlatformConfigFixture.config(7, "synthetic-key");
        var config = new PlatformConfig(7, base.providers(), base.models(), base.defaultModelId(), base.asr(),
                base.embedding(), base.webSearch(), base.screenshotModelId(), base.rerank(),
                new PlatformConfig.QuestionRewrite(enabled, "careful", 1500));
        return new PlatformSnapshot(config, Map.of("primary", "synthetic-key"), PlatformPolicy.from(new ProviderProperties()));
    }
}
