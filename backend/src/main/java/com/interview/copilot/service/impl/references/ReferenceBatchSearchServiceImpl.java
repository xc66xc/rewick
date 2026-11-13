package com.interview.copilot.service.impl.references;

import com.interview.copilot.exception.ApiException;
import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.request.references.SearchReferenceBatchRequest;
import com.interview.copilot.response.references.ReferenceBatchRetrievalResponse;
import com.interview.copilot.service.auth.SessionGuardService;
import com.interview.copilot.service.references.ReferenceBatchRetrievalService;
import com.interview.copilot.service.references.ReferenceBatchSearchService;
import com.interview.copilot.service.references.ReferenceCancellationService;
import com.interview.copilot.service.references.ReferenceStorageService;
import com.interview.copilot.service.usage.UsageService;
import com.interview.copilot.validation.references.ReferenceBatchPolicy;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import java.util.Map;

@Service
public final class ReferenceBatchSearchServiceImpl implements ReferenceBatchSearchService {
    private final ReferenceStorageService documents;
    private final UsageService usage;
    private final ReferenceBatchRetrievalService retrieval;
    private final ReferenceCancellationService cancellations;
    private final SessionGuardService sessions;

    public ReferenceBatchSearchServiceImpl(ReferenceStorageService documents, UsageService usage,
            ReferenceBatchRetrievalService retrieval, ReferenceCancellationService cancellations,
            SessionGuardService sessions) {
        this.documents = documents;
        this.usage = usage;
        this.retrieval = retrieval;
        this.cancellations = cancellations;
        this.sessions = sessions;
    }

    public ReferenceBatchRetrievalResponse search(long user, long token, String requestId,
            SearchReferenceBatchRequest input, OperationContext context) {
        ReferenceBatchPolicy.request(input);
        String identifier = ReferenceBatchPolicy.requestId(requestId);
        sessions.requireSession(user, token);
        if (!input.referenceIds().isEmpty()) documents.requireAll(user, input.referenceIds().stream().map(Object::toString).toList());
        try (var work = cancellations.register(user, identifier);
                var lease = usage.startForSession(user, identifier, "knowledge", token)) {
            lease.watch(() -> cancellations.cancel(user, identifier));
            try {
                var result = retrieval.retrieve(user, input, context);
                com.interview.copilot.model.references.ReferenceQueryPlan.checkCancellation();
                sessions.requireSession(user, token);
                if (!lease.isActive()) throw new ApiException(HttpStatus.CONFLICT, "INTERVIEW_NOT_ACTIVE", "面试已结束，请重新开始面试。");
                if (result.status().equals("degraded")) lease.fail(); else lease.complete();
                if (context != null) context.finish("retrieval.rag", result.status().equals("degraded") ? "degraded" : "success",
                        Map.of("questionCount", input.queries().size(), "fragmentCount", result.excerpts().size()));
                return result;
            } catch (RuntimeException error) {
                if (error instanceof java.util.concurrent.CancellationException) lease.cancel(); else lease.fail();
                if (context != null) context.finish("retrieval.rag", error instanceof java.util.concurrent.CancellationException ? "cancelled" : "error",
                        Map.of("questionCount", input.queries().size()));
                throw error;
            }
        }
    }
}
