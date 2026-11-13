package com.interview.copilot.service.impl.references;

import com.interview.copilot.common.references.ReferenceFusion;
import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.model.references.ReferenceBatchSelection;
import com.interview.copilot.model.references.ReferenceQueryPlan;
import com.interview.copilot.model.references.ReferenceRecall;
import com.interview.copilot.model.references.ReferenceRerank;
import com.interview.copilot.response.references.ReferenceHybridResponse;
import com.interview.copilot.service.references.ReferenceBatchRankingService;
import com.interview.copilot.service.references.ReferenceRerankService;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Map;

@Service
public final class ReferenceBatchRankingServiceImpl implements ReferenceBatchRankingService {
    private final ReferenceRerankService rerank;
    private final ReferenceFusion fusion = new ReferenceFusion();

    public ReferenceBatchRankingServiceImpl(ReferenceRerankService rerank) { this.rerank = rerank; }

    public ReferenceBatchSelection rank(String questionId, String query, ReferenceRecall.Pair pair,
            ReferenceQueryPlan plan, OperationContext context) {
        ReferenceQueryPlan.checkCancellation();
        var policy = plan.policy();
        var ranked = fusion.fuse(pair.bm25().candidates(), pair.vector().candidates(), policy.rrfConstant());
        var pool = ranked.stream().limit(policy.rrfTopN()).toList();
        if (context != null) context.child("pg").finish("retrieval.fusion", "success", Map.of(
                "candidateCount", ranked.size(), "selectedCount", pool.size(), "policyVersion", policy.version()));
        var reordered = rerank.rank(query, pool, plan.snapshot(), plan.workDeadlineNanos(), context);
        ReferenceQueryPlan.checkCancellation();
        return selection(questionId, pair, plan, reordered, ranked.size(), pool.size());
    }

    public ReferenceBatchSelection fallback(String questionId, ReferenceRecall.Pair pair, ReferenceQueryPlan plan) {
        ReferenceQueryPlan.checkCancellation();
        var ranked = fusion.fuse(pair.bm25().candidates(), pair.vector().candidates(), plan.policy().rrfConstant());
        var pool = ranked.stream().limit(plan.policy().rrfTopN()).toList();
        boolean disabled = plan.snapshot() != null && !plan.snapshot().view().rerank().enabled();
        var reordered = new ReferenceRerank.Result(pool, !disabled, disabled ? "disabled" : "degraded", disabled ? null : "timeout",
                plan.snapshot() == null ? "" : plan.snapshot().view().rerank().model(), 0, 0);
        var selected = selection(questionId, pair, plan, reordered, ranked.size(), pool.size());
        return new ReferenceBatchSelection(questionId, "degraded", selected.message() + "timeout：整轮资料预算已用尽，已保留完成的召回。",
                selected.candidates(), selected.hybrid());
    }

    private ReferenceBatchSelection selection(String questionId, ReferenceRecall.Pair pair, ReferenceQueryPlan plan,
            ReferenceRerank.Result reordered, int count, int pool) {
        var policy = plan.policy();
        var selected = reordered.candidates().stream()
                .limit("disabled".equals(reordered.status()) ? policy.rrfTopN() : policy.rerankTopN()).toList();
        boolean degraded = pair.bm25().status().equals("degraded") || pair.vector().status().equals("degraded")
                || reordered.status().equals("degraded") || "input_limit".equals(reordered.reason());
        return new ReferenceBatchSelection(questionId, degraded ? "degraded" : selected.isEmpty() ? "empty" : "ready",
                message(pair, reordered), selected, details(pair, plan, reordered, count, pool, selected.size()));
    }

    private String message(ReferenceRecall.Pair pair, ReferenceRerank.Result result) {
        return (pair.bm25().status().equals("degraded") ? "BM25 关键词检索降级。" : "")
                + (pair.vector().status().equals("degraded") ? "向量检索降级。" : "")
                + (result.status().equals("degraded") || "input_limit".equals(result.reason()) ? "重排序降级，按该题 RRF 顺序保留资料。" : "");
    }

    private ReferenceHybridResponse details(ReferenceRecall.Pair pair, ReferenceQueryPlan plan,
            ReferenceRerank.Result result, int count, int pool, int selected) {
        var policy = plan.policy();
        return new ReferenceHybridResponse(branch(pair.bm25(), policy.bm25TopK()), branch(pair.vector(), policy.vectorTopK()),
                new ReferenceHybridResponse.Fusion("rrf", policy.rrfConstant(), 0, count, pool, policy.rrfTopN()),
                new ReferenceHybridResponse.Rerank(result.status(), result.model(), result.submittedCount(), selected,
                        policy.rerankTopN(), result.durationMs(), result.reason()));
    }

    private ReferenceHybridResponse.Branch branch(ReferenceRecall.Branch branch, int topK) {
        return new ReferenceHybridResponse.Branch(branch.status(), branch.candidates().size(), branch.durationMs(), topK);
    }
}
