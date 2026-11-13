package com.interview.copilot.service.references;

import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import com.interview.copilot.entity.references.ReferenceScopeEntity;
import com.interview.copilot.model.references.ReferenceRecall;
import com.interview.copilot.model.operations.OperationContext;
import java.util.List;

public interface ReferenceParallelService {
    ReferenceRecall.Pair recall(long user, List<ReferenceScopeEntity> scope, String query,
            ReferencePolicy policy, OperationContext context);
    ReferenceRecall.Pair recall(long user, List<ReferenceScopeEntity> scope, String query,
            com.interview.copilot.model.references.ReferenceQueryPlan plan, OperationContext context);
    default ReferenceRecall.Pair recallWithVector(long user, List<ReferenceScopeEntity> scope, String query,
            com.interview.copilot.model.references.ReferenceQueryPlan plan, OperationContext context,
            java.util.function.Supplier<List<com.interview.copilot.entity.references.ReferenceCandidateEntity>> vector) {
        throw new UnsupportedOperationException("Batch recall is unavailable");
    }
    default ReferenceRecall.Pair recallWithVector(long user, List<ReferenceScopeEntity> scope, String query,
            com.interview.copilot.model.references.ReferenceQueryPlan plan, OperationContext context,
            java.util.function.Supplier<List<ReferenceCandidateEntity>> vector,
            java.util.function.BiConsumer<String, ReferenceRecall.Branch> completed) {
        var pair = recallWithVector(user, scope, query, plan, context, vector);
        completed.accept("retrieval.bm25", pair.bm25());
        completed.accept("retrieval.vector", pair.vector());
        return pair;
    }
}
