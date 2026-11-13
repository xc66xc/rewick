package com.interview.copilot.service.impl.references;

import com.interview.copilot.common.references.PlatformEmbeddingClient;
import com.interview.copilot.common.references.ReferenceAnalyzer;
import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.entity.references.ReferenceScopeEntity;
import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import com.interview.copilot.mapper.references.ReferenceHybridMapper;
import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.model.references.ReferenceQueryPlan;
import com.interview.copilot.service.references.ReferenceRecallService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.List;

@Service
public class ReferenceRecallServiceImpl implements ReferenceRecallService {
    private final ReferenceHybridMapper mapper;
    private final PlatformEmbeddingClient embedding;
    private final ReferenceAnalyzer analyzer;
    private final TransactionTemplate transaction;
    private final com.interview.copilot.service.references.ReferenceVectorService vectors;
    public ReferenceRecallServiceImpl(ReferenceHybridMapper mapper, PlatformEmbeddingClient embedding,
            ReferenceAnalyzer analyzer, PlatformTransactionManager manager, com.interview.copilot.service.references.ReferenceVectorService vectors) {
        this.vectors = vectors;
        this.mapper = mapper;
        this.embedding = embedding;
        this.analyzer = analyzer;
        this.transaction = new TransactionTemplate(manager);
        this.transaction.setReadOnly(true);
    }
    public List<ReferenceCandidateEntity> bm25(long user, List<ReferenceScopeEntity> scope, String query, ReferencePolicy policy) {
        return bm25(user, scope, query, ReferenceQueryPlan.start(policy, null));
    }
    public List<ReferenceCandidateEntity> bm25(long user, List<ReferenceScopeEntity> scope, String query, ReferenceQueryPlan plan) {
        var policy = plan.policy();
        var terms = analyzer.query(query);
        if (terms.isEmpty() || scope.isEmpty()) return List.of();
        return transaction.execute(status -> {
            mapper.timeout(Integer.toString(ReferenceQueryPlan.timeoutMillis(plan.workDeadlineNanos(), policy.bm25TimeoutMs())));
            return mapper.bm25(user, scope, terms, policy.bm25K1(), policy.bm25B(), policy.bm25TopK());
        });
    }
    public List<ReferenceCandidateEntity> vector(long user, List<ReferenceScopeEntity> scope, String query,
            ReferencePolicy policy, OperationContext context) {
        if (scope.isEmpty()) return List.of();
        var selection = embedding.selection();
        var vector = embedding.embed(selection, List.of(query), context == null ? null : context.child("llm")).getFirst();
        if (Thread.currentThread().isInterrupted()) throw new java.util.concurrent.CancellationException();
        return vectors.search(user, scope, vector.toString(), selection.fingerprint(), policy);
    }
    public List<ReferenceCandidateEntity> vector(long user, List<ReferenceScopeEntity> scope, String query,
            ReferenceQueryPlan plan, OperationContext context) {
        if (scope.isEmpty()) return List.of();
        var selection = embedding.selection(plan.snapshot());
        var vector = embedding.embed(selection, List.of(query), context == null ? null : context.child("llm"), plan.workDeadlineNanos()).getFirst();
        ReferenceQueryPlan.checkCancellation();
        return vectors.search(user, scope, vector.toString(), selection.fingerprint(), plan);
    }
    public com.interview.copilot.model.references.ReferenceQueryVectors queryVectors(List<String> queries,
            ReferenceQueryPlan plan, OperationContext context) {
        var selection = embedding.selection(plan.snapshot());
        var values = embedding.embed(selection, queries, context == null ? null : context.child("llm"), plan.workDeadlineNanos());
        return new com.interview.copilot.model.references.ReferenceQueryVectors(selection.fingerprint(), values);
    }
    public List<ReferenceCandidateEntity> vector(long user, List<ReferenceScopeEntity> scope, List<Double> vector,
            String fingerprint, ReferenceQueryPlan plan) {
        ReferenceQueryPlan.checkCancellation();
        return vectors.search(user, scope, vector.toString(), fingerprint, plan);
    }
}
