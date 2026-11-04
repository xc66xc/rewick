package com.interview.copilot.service.impl.screenshots;

import com.interview.copilot.common.ai.LlmConcurrency;
import com.interview.copilot.common.usage.UsageLease;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.service.platform.PlatformRuntimeService;
import com.interview.copilot.service.screenshots.ScreenshotService;
import com.interview.copilot.service.usage.UsageService;
import com.interview.copilot.util.ai.ProviderCompletions;
import com.interview.copilot.util.ai.ProviderHttpClient;
import com.interview.copilot.util.ai.ProviderJson;
import com.interview.copilot.validation.ai.LlmRequestPolicy;
import com.interview.copilot.validation.screenshots.ScreenshotPolicy;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.publisher.Sinks;

import java.time.Duration;
import java.util.Map;

@Service
public final class ScreenshotServiceImpl implements ScreenshotService {
    private final PlatformRuntimeService providers;
    private final ProviderHttpClient http;
    private final ProviderJson json;
    private final UsageService usage;
    private final LlmConcurrency concurrency;

    public ScreenshotServiceImpl(PlatformRuntimeService providers, ProviderHttpClient http,
            ProviderJson json, UsageService usage, LlmConcurrency concurrency) {
        this.providers = providers;
        this.http = http;
        this.json = json;
        this.usage = usage;
        this.concurrency = concurrency;
    }

    @Override
    public Mono<String> recognize(long userId, String requestId, String image, OperationContext context) {
        return Mono.defer(() -> start(userId, LlmRequestPolicy.requestId(requestId), image, context))
                .doOnError(error -> finish(context, "error"))
                .doOnCancel(() -> finish(context, "cancelled"));
    }

    private Mono<String> start(long userId, String requestId, String image, OperationContext context) {
        ScreenshotPolicy.image(image);
        var snapshot = providers.snapshot();
        String model = snapshot.view().screenshotModelId();
        if (model.isBlank()) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                "SCREENSHOT_UNAVAILABLE", "平台尚未配置截图识别模型，请联系管理员在模型与服务中选择支持读图的模型。");
        var endpoint = snapshot.llm(model).config();
        var observed = context == null ? null : context.model(endpoint.getModel());
        var permit = concurrency.acquire(userId, endpoint.getMaxConcurrent());
        UsageLease lease;
        try {
            lease = usage.start(userId, requestId, "llm");
        } catch (RuntimeException error) { permit.close(); throw error; }
        return Mono.defer(() -> {
                    usage.describeModel(userId, requestId, "llm", endpoint.getModel());
                    return request(image, endpoint, lease, observed);
                })
                .doOnError(error -> lease.fail())
                .doOnCancel(lease::cancel)
                .doFinally(signal -> { try { lease.close(); } finally { permit.close(); } });
    }

    private Mono<String> request(String image,
            com.interview.copilot.config.ProviderProperties.Llm endpoint, UsageLease lease,
            OperationContext context) {
        Sinks.Empty<Void> expired = Sinks.empty();
        lease.watch(() -> expired.tryEmitError(new ApiException(HttpStatus.CONFLICT,
                "SESSION_INACTIVE", "面试已结束，截图识别已取消。")));
        return ProviderCompletions.complete(http, json, endpoint, ScreenshotPolicy.body(endpoint, image),
                        Duration.ofSeconds(Math.min(60, endpoint.getTotalTimeoutSeconds())))
                .switchIfEmpty(Mono.error(com.interview.copilot.exception.ai.ProviderErrors.failed()))
                .takeUntilOther(expired.asMono())
                .map(value -> {
                    json.completion(value, "message");
                    ScreenshotPolicy.finishReason(value.path("choices").path(0).path("finish_reason").asText(""));
                    return ScreenshotPolicy.question(value.path("choices").path(0).path("message").path("content").asText());
                })
                .doOnSuccess(value -> { lease.complete(); finish(context, "success"); })
                .doOnError(error -> { lease.fail(); finish(context, "error"); })
                .doOnCancel(() -> { lease.cancel(); finish(context, "cancelled"); });
    }

    private static void finish(OperationContext context, String outcome) {
        if (context != null) context.finish("screenshot.recognize", outcome, Map.of());
    }
}
