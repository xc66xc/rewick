package com.interview.copilot.service.impl.references;

import com.interview.copilot.common.references.PlatformEmbeddingClient;
import com.interview.copilot.common.references.ReferenceAnalyzer;
import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.entity.references.ReferenceScopeEntity;
import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import com.interview.copilot.mapper.references.ReferenceHybridMapper;
import com.interview.copilot.model.operations.OperationContext;
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
        var terms = analyzer.query(query);
        if (terms.isEmpty() || scope.isEmpty()) return List.of();
        return transaction.execute(status -> {
            mapper.timeout(Integer.toString(policy.bm25TimeoutMs()));
            return mapper.bm25(user, scope, terms, policy.bm25K1(), policy.bm25B());
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
}
