package com.interview.copilot.service.screenshots;

import com.interview.copilot.model.operations.OperationContext;
import reactor.core.publisher.Mono;

public interface ScreenshotService {
    Mono<String> recognize(long userId, String requestId, String image, OperationContext context);
}
