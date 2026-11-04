package com.interview.copilot.controller.screenshots;

import com.interview.copilot.request.screenshots.ScreenshotRequest;
import com.interview.copilot.response.screenshots.ScreenshotResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.operations.OperationsService;
import com.interview.copilot.service.screenshots.ScreenshotService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

@RestController
public final class ScreenshotController {
    private final ScreenshotService screenshots;
    private final OperationsService operations;

    public ScreenshotController(ScreenshotService screenshots, OperationsService operations) {
        this.screenshots = screenshots;
        this.operations = operations;
    }

    @PostMapping("/api/v1/screenshots/recognize")
    public Mono<ScreenshotResponse> recognize(@AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody ScreenshotRequest input,
            @RequestHeader(value = "X-Request-Id", required = false) String requestId,
            @RequestHeader(value = "X-Operation-Id", required = false) String operationId) {
        if (user == null) throw new com.interview.copilot.exception.ApiException(
                org.springframework.http.HttpStatus.UNAUTHORIZED, "unauthorized", "请登录后再使用平台服务。");
        return screenshots.recognize(user.id(), requestId, input.image(),
                operations.start(user.id(), operationId, null, requestId, null, "llm", null))
                .map(ScreenshotResponse::new);
    }
}
