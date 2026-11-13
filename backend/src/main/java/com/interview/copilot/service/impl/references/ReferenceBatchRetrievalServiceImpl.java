package com.interview.copilot.service.impl.references;

import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import com.interview.copilot.entity.references.ReferenceScopeEntity;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.model.references.ReferenceBatchSelection;
import com.interview.copilot.model.references.ReferenceQueryPlan;
import com.interview.copilot.model.references.ReferenceQueryVectors;
import com.interview.copilot.model.references.ReferenceRecall;
import com.interview.copilot.request.references.SearchReferenceBatchRequest;
import com.interview.copilot.response.references.ReferenceBatchRetrievalResponse;
import com.interview.copilot.response.references.ReferenceQueryRetrievalResponse;
import com.interview.copilot.service.references.ReferenceBatchContextService;
import com.interview.copilot.service.references.ReferenceBatchRankingService;
import com.interview.copilot.service.references.ReferenceBatchRetrievalService;
import com.interview.copilot.service.references.ReferenceParallelService;
import com.interview.copilot.service.references.ReferenceQueryService;
import com.interview.copilot.service.references.ReferenceRecallService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorCompletionService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicReference;

@Service
public final class ReferenceBatchRetrievalServiceImpl implements ReferenceBatchRetrievalService {
    private static final Logger LOG = LoggerFactory.getLogger(ReferenceBatchRetrievalServiceImpl.class);
    private final ReferenceQueryService queries;
    private final ReferenceRecallService recall;
    private final ReferenceParallelService parallel;
    private final ReferenceBatchRankingService ranking;
    private final ReferenceBatchContextService contexts;

    public ReferenceBatchRetrievalServiceImpl(ReferenceQueryService queries, ReferenceRecallService recall,
            ReferenceParallelService parallel, ReferenceBatchRankingService ranking, ReferenceBatchContextService contexts) {
        this.queries = queries;
        this.recall = recall;
        this.parallel = parallel;
        this.ranking = ranking;
        this.contexts = contexts;
    }

    public ReferenceBatchRetrievalResponse retrieve(long user, SearchReferenceBatchRequest input, OperationContext context) {
        var plan = queries.prepare();
        if (input.referenceIds().isEmpty() || !plan.policy().hybridEnabled()) return inactive(input, plan, "disabled", "参考资料检索未启用或未选择资料。");
        var ids = input.referenceIds().stream().map(Object::toString).distinct().toList();
        var scope = queries.scope(user, ids, plan);
        if (scope.isEmpty()) return inactive(input, plan, "empty", "所选资料尚未建立可用索引。");
        var selections = execute(user, input, scope, plan, context);
        ReferenceQueryPlan.checkCancellation();
        var current = queries.scope(user, ids, plan).stream().filter(row -> scope.stream().anyMatch(old ->
                old.documentId().equals(row.documentId()) && old.revision() == row.revision())).toList();
        return contexts.pack(user, current, selections, plan, context);
    }

    private List<ReferenceBatchSelection> execute(long user, SearchReferenceBatchRequest input,
            List<ReferenceScopeEntity> scope, ReferenceQueryPlan plan, OperationContext context) {
        // At most one embedding task and two coordinators. SQL always runs on the existing pools.
        ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
        var vectors = executor.submit(() -> recall.queryVectors(input.queries().stream().map(SearchReferenceBatchRequest.Query::query).toList(), plan, context));
        var completion = new ExecutorCompletionService<Indexed>(executor);
        var active = new HashSet<Future<Indexed>>();
        ReferenceBatchSelection[] results = new ReferenceBatchSelection[input.queries().size()];
        var progress = input.queries().stream().map(query -> new Progress()).toList();
        try {
            int next = 0;
            for (; next < Math.min(2, results.length); next++) active.add(submit(completion, user, input, scope, plan, context, vectors, progress.get(next), next));
            while (!active.isEmpty() && ReferenceQueryPlan.remainingNanos(plan.workDeadlineNanos()) > 0) {
                var completed = completion.poll(ReferenceQueryPlan.remainingNanos(plan.workDeadlineNanos()), TimeUnit.NANOSECONDS);
                if (completed == null) break;
                active.remove(completed);
                var value = get(completed);
                results[value.index()] = value.selection();
                if (next < results.length && ReferenceQueryPlan.remainingNanos(plan.workDeadlineNanos()) > 0)
                    active.add(submit(completion, user, input, scope, plan, context, vectors, progress.get(next), next++));
            }
            for (var finished : active) if (finished.isDone() && !finished.isCancelled()) {
                var value = get(finished);
                results[value.index()] = value.selection();
            }
            return seal(input, results, progress, plan);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new CancellationException("资料批次已取消。");
        } finally {
            for (var future : active) future.cancel(true);
            vectors.cancel(true);
            executor.shutdownNow();
        }
    }

    private Future<Indexed> submit(ExecutorCompletionService<Indexed> completion, long user,
            SearchReferenceBatchRequest input, List<ReferenceScopeEntity> scope, ReferenceQueryPlan plan,
            OperationContext context, Future<ReferenceQueryVectors> vectors, Progress progress, int index) {
        return completion.submit(() -> {
            var query = input.queries().get(index);
            var child = child(user, context);
            try {
                var pair = parallel.recallWithVector(user, scope, query.query(), plan, child,
                        () -> vector(user, scope, vectors, index, plan), progress::completed);
                var result = ranking.rank(query.questionId(), query.query(), pair, plan, child);
                if (child != null) child.finish("retrieval.rag", result.status().equals("degraded") ? "degraded" : "success",
                        java.util.Map.of("questionIndex", index + 1, "candidateCount", result.candidates().size()));
                return new Indexed(index, result);
            } catch (RuntimeException error) {
                if (child != null) child.finish("retrieval.rag", error instanceof CancellationException ? "cancelled" : terminal(error) ? "error" : "degraded",
                        java.util.Map.of("questionIndex", index + 1));
                if (terminal(error)) throw error;
                LOG.error("[error] Reference batch query degraded user={} index={}", user, index, error);
                return new Indexed(index, new ReferenceBatchSelection(query.questionId(), "degraded", "该题资料检索降级。", List.of(), null));
            }
        });
    }

    private List<ReferenceCandidateEntity> vector(long user, List<ReferenceScopeEntity> scope,
            Future<ReferenceQueryVectors> future, int index, ReferenceQueryPlan plan) {
        try {
            var batch = future.get(ReferenceQueryPlan.remainingNanos(plan.workDeadlineNanos()), TimeUnit.NANOSECONDS);
            return recall.vector(user, scope, batch.vectors().get(index), batch.fingerprint(), plan);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new CancellationException();
        } catch (TimeoutException error) {
            throw new IllegalStateException("批量查询向量超时。", error);
        } catch (ExecutionException error) {
            throw propagate(error);
        }
    }

    private Indexed get(Future<Indexed> future) throws InterruptedException {
        try { return future.get(); }
        catch (ExecutionException error) { throw propagate(error); }
    }

    private RuntimeException propagate(ExecutionException error) {
        if (error.getCause() instanceof RuntimeException runtime) return runtime;
        return new IllegalStateException("资料批次子任务失败。", error.getCause());
    }

    private boolean terminal(RuntimeException error) {
        return error instanceof CancellationException || Thread.currentThread().isInterrupted()
                || error instanceof ApiException api && List.of(401, 402, 403, 409).contains(api.status().value());
    }

    private List<ReferenceBatchSelection> seal(SearchReferenceBatchRequest input, ReferenceBatchSelection[] results,
            List<Progress> progress, ReferenceQueryPlan plan) {
        for (int i = 0; i < results.length; i++) if (results[i] == null) {
            String id = input.queries().get(i).questionId();
            var pair = progress.get(i).snapshot();
            results[i] = pair == null ? new ReferenceBatchSelection(id, "degraded",
                    "timeout：整轮资料检索预算已用尽，该题未完成。", List.of(), null) : ranking.fallback(id, pair, plan);
        }
        return List.copyOf(Arrays.asList(results));
    }

    private OperationContext child(long user, OperationContext context) {
        return context == null ? null : OperationContext.start(user, context.operationId(), context.spanId(),
                UUID.randomUUID().toString(), context.sessionId(), "pg", null, context.sink());
    }

    private ReferenceBatchRetrievalResponse inactive(SearchReferenceBatchRequest input, ReferenceQueryPlan plan,
            String status, String message) {
        var details = input.queries().stream().map(query -> new ReferenceQueryRetrievalResponse(query.questionId(),
                status, message, null, List.of())).toList();
        return new ReferenceBatchRetrievalResponse(status, message, List.of(), details, plan.policy().version(),
                plan.snapshot() == null ? null : plan.snapshot().view().version());
    }

    private record Indexed(int index, ReferenceBatchSelection selection) {}

    private static final class Progress {
        private final AtomicReference<ReferenceRecall.Branch> bm25 = new AtomicReference<>();
        private final AtomicReference<ReferenceRecall.Branch> vector = new AtomicReference<>();
        private void completed(String stage, ReferenceRecall.Branch branch) {
            (stage.equals("retrieval.bm25") ? bm25 : vector).set(branch);
        }
        private ReferenceRecall.Pair snapshot() {
            var lexical = bm25.get();
            var semantic = vector.get();
            if (lexical == null && semantic == null) return null;
            var unfinished = new ReferenceRecall.Branch("degraded", List.of(), 0);
            return new ReferenceRecall.Pair(lexical == null ? unfinished : lexical, semantic == null ? unfinished : semantic);
        }
    }
}
