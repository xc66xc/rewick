package com.interview.copilot.controller.questions;

import com.interview.copilot.request.questions.QuestionRewriteRequest;
import com.interview.copilot.response.questions.QuestionRewriteResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.operations.OperationsService;
import com.interview.copilot.service.questions.QuestionRewriteCancellationService;
import com.interview.copilot.service.questions.QuestionRewriteService;
import com.interview.copilot.validation.questions.QuestionRewritePolicy;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

@RestController
public final class QuestionRewriteController {
    private final QuestionRewriteService rewrite;
    private final QuestionRewriteCancellationService cancellations;
    private final OperationsService operations;

    public QuestionRewriteController(QuestionRewriteService rewrite,
            QuestionRewriteCancellationService cancellations, OperationsService operations) {
        this.rewrite = rewrite;
        this.cancellations = cancellations;
        this.operations = operations;
    }

    @PostMapping("/api/v1/questions/rewrite")
    public Mono<QuestionRewriteResponse> rewrite(@AuthenticationPrincipal UserPrincipal user,
            @RequestBody QuestionRewriteRequest body,
            @RequestHeader("X-Request-Id") String requestId,
            @RequestHeader(value = "X-Operation-Id", required = false) String operation,
            @RequestHeader(value = "X-Parent-Span-Id", required = false) String parent) {
        String identifier = QuestionRewritePolicy.requestId(requestId);
        return rewrite.rewrite(user.id(), user.tokenId(), identifier, body,
                operations.start(user.id(), operation, parent, identifier, null, "llm", null));
    }

    @DeleteMapping("/api/v1/questions/rewrite/{requestId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@AuthenticationPrincipal UserPrincipal user, @PathVariable String requestId) {
        cancellations.cancel(user.id(), QuestionRewritePolicy.requestId(requestId));
    }
}
