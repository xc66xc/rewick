package com.interview.copilot.service.questions;

import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.request.questions.QuestionRewriteRequest;
import com.interview.copilot.response.questions.QuestionRewriteResponse;
import reactor.core.publisher.Mono;

public interface QuestionRewriteService {
    Mono<QuestionRewriteResponse> rewrite(long user, long token, String requestId,
            QuestionRewriteRequest input, OperationContext context);
}
