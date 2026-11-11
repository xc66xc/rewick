package com.interview.copilot.service.impl.references;

import com.interview.copilot.common.references.ReferenceFusion;
import com.interview.copilot.entity.references.ReferenceScopeEntity;
import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.model.references.ReferenceQueryPlan;
import com.interview.copilot.model.references.ReferenceRecall;
import com.interview.copilot.model.references.ReferenceRerank;
import com.interview.copilot.response.references.ReferenceExcerptResponse;
import com.interview.copilot.response.references.ReferenceHybridResponse;
import com.interview.copilot.response.references.ReferenceRetrievalResponse;
import com.interview.copilot.service.references.ReferenceHybridService;
import com.interview.copilot.service.references.ReferenceParallelService;
import com.interview.copilot.service.references.ReferenceContextService;
import com.interview.copilot.service.references.ReferenceQueryService;
import com.interview.copilot.service.references.ReferenceRerankService;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Map;

@Service
public class ReferenceHybridServiceImpl implements ReferenceHybridService {
    private final ReferenceQueryService queries;
    private final ReferenceParallelService parallel;
    private final ReferenceContextService contexts;
    private final ReferenceRerankService rerank;
    private final ReferenceFusion fusion = new ReferenceFusion();

    public ReferenceHybridServiceImpl(ReferenceQueryService queries, ReferenceParallelService parallel,
            ReferenceContextService contexts, ReferenceRerankService rerank) {
        this.queries = queries;
        this.parallel = parallel;
        this.contexts = contexts;
        this.rerank = rerank;
    }
    public ReferenceRetrievalResponse retrieve(long user, String query, List<String> ids, OperationContext observation) {
        var plan = queries.prepare();
        if (!plan.policy().hybridEnabled()) return new ReferenceRetrievalResponse("disabled", "平台参考资料混合检索已停用。", List.of(), null);
        var scope = queries.scope(user, ids, plan);
        if (scope.isEmpty()) return new ReferenceRetrievalResponse("empty", "所选资料尚未建立新索引，请重新上传或重建 Markdown/Word 资料。", List.of(), null);
        var pair = parallel.recall(user, scope, query, plan, observation);
        var ranked = fusion.fuse(pair.bm25().candidates(), pair.vector().candidates(), plan.policy().rrfConstant());
        var current = currentScope(user, ids, scope, plan);
        var pool = eligible(ranked, current).stream().limit(plan.policy().rrfTopN()).toList();
        var span = observation == null ? null : observation.child("pg");
        if (span != null) span.finish("retrieval.fusion", "success", Map.of("candidateCount", ranked.size(),
                "selectedCount", pool.size(), "rrfTopN", plan.policy().rrfTopN(), "rerankTopN", plan.policy().rerankTopN(),
                "policyVersion", plan.policy().version()));
        var reranked = rerank.rank(query, pool, plan.snapshot(), plan.workDeadlineNanos(), observation);
        ReferenceQueryPlan.checkCancellation();
        var finalScope = reranked.enabled() ? currentScope(user, ids, current, plan) : current;
        var selected = eligible(reranked.candidates(), finalScope).stream()
                .limit("disabled".equals(reranked.status()) ? plan.policy().rrfTopN() : plan.policy().rerankTopN()).toList();
        var excerpts = contexts.expand(user, finalScope, selected, plan, observation);
        ReferenceQueryPlan.checkCancellation();
        boolean changed = current.size() != scope.size() || finalScope.size() != current.size();
        boolean degraded = changed || isDegraded(pair, reranked)
                || excerpts.stream().anyMatch(e -> e.contextExpansion().equals("child"));
        var details = details(pair, plan, reranked, ranked.size(), pool.size(), selected.size(), excerpts.size());
        return new ReferenceRetrievalResponse(degraded ? "degraded" : excerpts.isEmpty() ? "empty" : "ready",
                message(pair, reranked, changed, excerpts), excerpts, details);
    }
    private List<ReferenceScopeEntity> currentScope(long user, List<String> ids,
            List<ReferenceScopeEntity> original, ReferenceQueryPlan plan) {
        return queries.scope(user, ids, plan).stream().filter(row -> original.stream()
                .anyMatch(old -> old.documentId().equals(row.documentId()) && old.revision() == row.revision())).toList();
    }
    private List<ReferenceRecall.Fused> eligible(List<ReferenceRecall.Fused> ranked, List<ReferenceScopeEntity> scope) {
        return ranked.stream().filter(item -> scope.stream().anyMatch(document ->
                document.documentId().equals(item.documentId()) && document.revision() == item.revision())).toList();
    }
    private boolean isDegraded(ReferenceRecall.Pair pair, ReferenceRerank.Result reranked) {
        return pair.bm25().status().equals("degraded") || pair.vector().status().equals("degraded")
                || reranked.status().equals("degraded") || reranked.enabled() && "input_limit".equals(reranked.reason());
    }
    private ReferenceHybridResponse details(ReferenceRecall.Pair pair, ReferenceQueryPlan plan,
            ReferenceRerank.Result reranked, int candidateCount, int poolCount, int selectedCount, int packedCount) {
        var policy = plan.policy();
        return new ReferenceHybridResponse(branch(pair.bm25(), policy.bm25TopK()), branch(pair.vector(), policy.vectorTopK()),
                new ReferenceHybridResponse.Fusion("rrf", policy.rrfConstant(), packedCount, candidateCount, poolCount, policy.rrfTopN()),
                new ReferenceHybridResponse.Rerank(reranked.status(), reranked.model(), reranked.submittedCount(), selectedCount,
                        policy.rerankTopN(), reranked.durationMs(), reranked.reason()));
    }
    private String message(ReferenceRecall.Pair pair, ReferenceRerank.Result reranked, boolean changed,
            List<ReferenceExcerptResponse> excerpts) {
        return (pair.bm25().status().equals("degraded") ? "BM25 关键词检索降级。" : "")
                + (pair.vector().status().equals("degraded") ? "向量检索降级。" : "")
                + (reranked.status().equals("degraded") ? "重排序服务降级，已保留 RRF 顺序。" : "")
                + ("input_limit".equals(reranked.reason()) ? "重排序输入超限，已按 RRF 顺序保留资料。" : "")
                + (changed ? "部分资料状态或版本已变更，已移除其结果。" : "")
                + (excerpts.stream().anyMatch(e -> e.contextExpansion().equals("child")) ? "部分父上下文未完整扩展，已保留命中子片段。" : "");
    }
    private ReferenceHybridResponse.Branch branch(ReferenceRecall.Branch value, int topK) {
        return new ReferenceHybridResponse.Branch(value.status(), value.candidates().size(), value.durationMs(), topK);
    }
}
