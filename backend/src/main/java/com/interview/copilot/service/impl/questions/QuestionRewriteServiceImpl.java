package com.interview.copilot.service.impl.questions;

import com.interview.copilot.common.questions.QuestionRewriteWork;
import com.interview.copilot.common.usage.UsageLease;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.exception.ai.ProviderFailure;
import com.interview.copilot.exception.questions.QuestionRewriteFailure;
import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.model.platform.PlatformSnapshot;
import com.interview.copilot.model.questions.QuestionRewriteResult;
import com.interview.copilot.request.questions.QuestionRewriteRequest;
import com.interview.copilot.response.questions.QuestionRewriteResponse;
import com.interview.copilot.service.platform.PlatformRuntimeService;
import com.interview.copilot.service.questions.QuestionRewriteAccessService;
import com.interview.copilot.service.questions.QuestionRewriteCancellationService;
import com.interview.copilot.service.questions.QuestionRewriteService;
import com.interview.copilot.service.usage.UsageService;
import com.interview.copilot.util.questions.QuestionRewriteClient;
import com.interview.copilot.validation.questions.QuestionRewritePolicy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.publisher.SignalType;
import reactor.core.publisher.Sinks;
import reactor.core.scheduler.Schedulers;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CancellationException;
import java.util.concurrent.TimeoutException;

@Service
public final class QuestionRewriteServiceImpl implements QuestionRewriteService {
    private static final Logger LOG = LoggerFactory.getLogger(QuestionRewriteServiceImpl.class);
    private final PlatformRuntimeService configs;
    private final QuestionRewriteClient client;
    private final QuestionRewriteAccessService access;
    private final QuestionRewriteCancellationService cancellations;
    private final UsageService usage;

    public QuestionRewriteServiceImpl(PlatformRuntimeService configs, QuestionRewriteClient client,
            QuestionRewriteAccessService access, QuestionRewriteCancellationService cancellations,
            UsageService usage) {
        this.configs = configs;
        this.client = client;
        this.access = access;
        this.cancellations = cancellations;
        this.usage = usage;
    }

    public Mono<QuestionRewriteResponse> rewrite(long user, long token, String requestId,
            QuestionRewriteRequest input, OperationContext context) {
        QuestionRewritePolicy.request(input);
        String identifier = QuestionRewritePolicy.requestId(requestId);
        return Mono.defer(() -> prepare(user, token, identifier, input, context))
                .map(value -> format(value, input))
                .subscribeOn(Schedulers.boundedElastic())
                .doOnError(error -> finishError(context, error))
                .doFinally(signal -> {
                    if (signal == SignalType.CANCEL && context != null)
                        context.finish("question.rewrite", "cancelled", "cancelled", Map.of());
                });
    }

    private Mono<QuestionRewriteResponse> prepare(long user, long token, String requestId,
            QuestionRewriteRequest input, OperationContext context) {
        long started = System.nanoTime();
        String sessionId = access.require(user, token);
        PlatformSnapshot snapshot = configs.snapshot();
        var config = snapshot.view().questionRewrite();
        long version = snapshot.view().version();
        if (!config.enabled()) return terminal("skipped", "disabled", null, started, version, context);
        if (QuestionRewritePolicy.characters(input.question()) > QuestionRewritePolicy.MAX_QUESTION_CHARACTERS)
            return terminal("skipped", "input_limit", null, started, version, context);
        var selected = snapshot.llm(config.modelId()).config();
        OperationContext observed = context == null ? null : context.provider("llm", selected.getModel());
        var work = cancellations.register(user, requestId);
        if (work.isEmpty()) return terminal("degraded", "busy", selected.getModel(), started, version, observed);
        return Mono.using(() -> usage.startForSession(user, requestId, "llm", token), lease -> {
                    usage.describeModel(user, requestId, "llm", selected.getModel());
                    return execute(user, token, sessionId, selected, input, snapshot, lease, observed, started, work.get());
                }, UsageLease::close).doFinally(signal -> work.get().close());
    }

    private Mono<QuestionRewriteResponse> execute(long user, long token, String sessionId,
            com.interview.copilot.config.ProviderProperties.Llm selected, QuestionRewriteRequest input,
            PlatformSnapshot snapshot, UsageLease lease, OperationContext context, long started,
            QuestionRewriteWork work) {
        Sinks.Empty<Void> expired = Sinks.empty();
        lease.watch(() -> expired.tryEmitError(inactive()));
        long remaining = snapshot.view().questionRewrite().timeoutMs() - (System.nanoTime() - started) / 1000000;
        var result = remaining <= 0 ? Mono.<QuestionRewriteResult>error(new TimeoutException())
                : client.rewrite(selected, input, Duration.ofMillis(remaining));
        return Mono.firstWithSignal(work.cancellation().then(Mono.<QuestionRewriteResult>empty()),
                        expired.asMono().then(Mono.<QuestionRewriteResult>empty()), result)
                .publishOn(Schedulers.boundedElastic())
                .map(value -> {
                    access.requireActive(user, token, sessionId);
                    return success(value, lease, selected.getModel(), snapshot.view().version(), started, context);
                })
                .onErrorResume(error -> {
                    if (!isCancellation(error)) access.requireActive(user, token, sessionId);
                    return failure(error, lease, selected.getModel(), snapshot.view().version(), started, context);
                }).doOnCancel(() -> {
                    if (context != null) context.finish("question.rewrite", "cancelled", "cancelled", Map.of());
                }).doOnError(error -> finishError(context, error));
    }

    private QuestionRewriteResponse success(QuestionRewriteResult result, UsageLease lease, String model,
            long version, long started, OperationContext context) {
        lease.complete();
        String status = Set.of("rewritten", "extracted").contains(result.action()) ? "rewritten" : "unchanged";
        String reason = "rewritten".equals(status) ? null : result.action();
        if (context != null) {
            var metadata = new java.util.HashMap<>(result.usage());
            metadata.put("platformVersion", version);
            if (!result.questions().isEmpty()) metadata.put("questionCount", result.questions().size());
            context.finish("question.rewrite", "success", reason, metadata);
        }
        var value = response(status, result.question(), reason, model, started, version);
        return result.questions().isEmpty() ? value : new QuestionRewriteResponse(status, null, reason, model,
                value.durationMs(), version, "questions-v1", result.questions());
    }

    private QuestionRewriteResponse format(QuestionRewriteResponse value, QuestionRewriteRequest input) {
        if (!input.isQuestionsFormat() || "questions-v1".equals(value.resultFormat())) return value;
        return new QuestionRewriteResponse(value.status(), null, value.reason(), value.model(), value.durationMs(),
                value.platformVersion(), "questions-v1", java.util.List.of());
    }

    private Mono<QuestionRewriteResponse> failure(Throwable error, UsageLease lease, String model,
            long version, long started, OperationContext context) {
        if (isCancellation(error)) {
            lease.cancel();
            if (context != null) context.finish("question.rewrite", "cancelled", "cancelled", Map.of());
            return Mono.error(error);
        }
        lease.fail();
        if (error instanceof ApiException api && !(error instanceof ProviderFailure)
                && (api.status() == HttpStatus.UNAUTHORIZED || "INTERVIEW_NOT_ACTIVE".equals(api.code())))
            return Mono.error(error);
        String reason = reason(error);
        if (context != null && error instanceof QuestionRewriteFailure failure) {
            var metadata = new java.util.HashMap<>(failure.usage());
            metadata.put("platformVersion", version);
            context.finish("question.rewrite", "degraded", reason, metadata);
        }
        LOG.warn("Question rewrite degraded request={} reason={} exception={}",
                context == null ? "unobserved" : context.requestId(), reason, error.getClass().getSimpleName());
        return terminal("degraded", reason, model, started, version, context);
    }

    private Mono<QuestionRewriteResponse> terminal(String status, String reason, String model,
            long started, long version, OperationContext context) {
        if (context != null) context.finish("question.rewrite", status.equals("skipped") ? "skipped" : "degraded",
                reason, Map.of("platformVersion", version));
        return Mono.just(response(status, null, reason, model, started, version));
    }

    private QuestionRewriteResponse response(String status, String question, String reason, String model,
            long started, long version) {
        return new QuestionRewriteResponse(status, question, reason, model,
                Math.max(0, (System.nanoTime() - started) / 1000000.0), version);
    }

    private String reason(Throwable error) {
        if (error instanceof QuestionRewriteFailure failure) return failure.reason();
        if (isTimeout(error)) return "timeout";
        return "provider_error";
    }

    private boolean isTimeout(Throwable error) {
        for (Throwable current = error; current != null; current = current.getCause()) {
            if (current instanceof TimeoutException) return true;
        }
        return error instanceof ProviderFailure provider && "timeout".equals(provider.reason());
    }

    private boolean isCancellation(Throwable error) {
        for (Throwable current = error; current != null; current = current.getCause()) {
            if (current instanceof CancellationException || current instanceof InterruptedException) return true;
        }
        return false;
    }

    private void finishError(OperationContext context, Throwable error) {
        if (context == null) return;
        if (isCancellation(error)) {
            context.finish("question.rewrite", "cancelled", "cancelled", Map.of());
            return;
        }
        String reason = "unavailable";
        String outcome = "error";
        if (error instanceof ApiException api && api.status().is4xxClientError()) {
            outcome = "rejected";
            reason = api.status() == HttpStatus.UNAUTHORIZED ? "unauthorized" : "invalid_input";
            if ("INTERVIEW_NOT_ACTIVE".equals(api.code())) reason = "session_inactive";
        }
        context.finish("question.rewrite", outcome, reason, Map.of());
    }

    private ApiException inactive() {
        return new ApiException(HttpStatus.CONFLICT, "INTERVIEW_NOT_ACTIVE", "面试已结束，请重新开始面试。");
    }
}
