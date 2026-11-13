package com.interview.copilot.service.references;

import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.entity.references.ReferenceScopeEntity;
import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import com.interview.copilot.model.operations.OperationContext;
import java.util.List;

public interface ReferenceRecallService {
    List<ReferenceCandidateEntity> bm25(long user, List<ReferenceScopeEntity> scope, String query, ReferencePolicy policy);
    List<ReferenceCandidateEntity> vector(long user, List<ReferenceScopeEntity> scope, String query, ReferencePolicy policy, OperationContext context);
    default List<ReferenceCandidateEntity> bm25(long user, List<ReferenceScopeEntity> scope, String query,
            com.interview.copilot.model.references.ReferenceQueryPlan plan) { return bm25(user, scope, query, plan.policy()); }
    default List<ReferenceCandidateEntity> vector(long user, List<ReferenceScopeEntity> scope, String query,
            com.interview.copilot.model.references.ReferenceQueryPlan plan, OperationContext context) { return vector(user, scope, query, plan.policy(), context); }
    default com.interview.copilot.model.references.ReferenceQueryVectors queryVectors(List<String> queries,
            com.interview.copilot.model.references.ReferenceQueryPlan plan, OperationContext context) {
        throw new UnsupportedOperationException("Batch query vectors are unavailable");
    }
    default List<ReferenceCandidateEntity> vector(long user, List<ReferenceScopeEntity> scope, List<Double> vector,
            String fingerprint, com.interview.copilot.model.references.ReferenceQueryPlan plan) {
        throw new UnsupportedOperationException("Precomputed query vectors are unavailable");
    }
}
