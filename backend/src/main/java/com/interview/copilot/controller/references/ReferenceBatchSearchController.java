package com.interview.copilot.controller.references;

import com.interview.copilot.request.references.SearchReferenceBatchRequest;
import com.interview.copilot.response.references.ReferenceBatchRetrievalResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.operations.OperationsService;
import com.interview.copilot.service.references.ReferenceBatchSearchService;
import com.interview.copilot.service.references.ReferenceCancellationService;
import com.interview.copilot.validation.references.ReferenceBatchPolicy;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public final class ReferenceBatchSearchController {
    private final ReferenceBatchSearchService search;
    private final ReferenceCancellationService cancellations;
    private final OperationsService operations;

    public ReferenceBatchSearchController(ReferenceBatchSearchService search,
            ReferenceCancellationService cancellations, OperationsService operations) {
        this.search = search;
        this.cancellations = cancellations;
        this.operations = operations;
    }

    @PostMapping("/api/v1/references/search/batch")
    public ReferenceBatchRetrievalResponse search(@AuthenticationPrincipal UserPrincipal user,
            @RequestBody SearchReferenceBatchRequest body, @RequestHeader("X-Request-Id") String requestId,
            @RequestHeader(value = "X-Operation-Id", required = false) String operation,
            @RequestHeader(value = "X-Parent-Span-Id", required = false) String parent) {
        String identifier = ReferenceBatchPolicy.requestId(requestId);
        return search.search(user.id(), user.tokenId(), identifier, body,
                operations.start(user.id(), operation, parent, identifier, null, "pg", null));
    }

    @DeleteMapping("/api/v1/references/search/batch/{requestId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@AuthenticationPrincipal UserPrincipal user, @PathVariable String requestId) {
        cancellations.cancel(user.id(), ReferenceBatchPolicy.requestId(requestId));
    }
}
