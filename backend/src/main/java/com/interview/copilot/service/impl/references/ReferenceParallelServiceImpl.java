package com.interview.copilot.service.impl.references;

import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.entity.references.ReferenceScopeEntity;
import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import com.interview.copilot.model.references.ReferenceRecall;
import com.interview.copilot.model.references.ReferenceQueryPlan;
import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.service.references.ReferenceParallelService;
import com.interview.copilot.service.references.ReferenceRecallService;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import jakarta.annotation.PreDestroy;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeoutException;
import java.util.function.Supplier;
import java.util.function.BiConsumer;

@Service
public class ReferenceParallelServiceImpl implements ReferenceParallelService {
    private static final Logger LOG = LoggerFactory.getLogger(ReferenceParallelServiceImpl.class);
    private final ReferenceRecallService recall;
    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(4, 4, 0, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(32), Thread.ofPlatform().daemon().name("reference-recall-", 0).factory(), new ThreadPoolExecutor.AbortPolicy());
    public ReferenceParallelServiceImpl(ReferenceRecallService recall) { this.recall = recall; }
    public ReferenceRecall.Pair recall(long user, List<ReferenceScopeEntity> scope, String query,
            ReferencePolicy policy, OperationContext context) {
        long start = System.nanoTime();
        return execute(user, () -> recall.bm25(user, scope, query, policy),
                () -> recall.vector(user, scope, query, policy, context), context, start,
                start + TimeUnit.MILLISECONDS.toNanos(26500));
    }
    public ReferenceRecall.Pair recall(long user, List<ReferenceScopeEntity> scope, String query,
            ReferenceQueryPlan plan, OperationContext context) {
        long start = System.nanoTime();
        return execute(user, () -> recall.bm25(user, scope, query, plan),
                () -> recall.vector(user, scope, query, plan, context), context, start, plan.workDeadlineNanos());
    }
    public ReferenceRecall.Pair recallWithVector(long user, List<ReferenceScopeEntity> scope, String query,
            ReferenceQueryPlan plan, OperationContext context, Supplier<List<ReferenceCandidateEntity>> vector) {
        long start = System.nanoTime();
        return execute(user, () -> recall.bm25(user, scope, query, plan), vector, context, start, plan.workDeadlineNanos(), true, null);
    }
    public ReferenceRecall.Pair recallWithVector(long user, List<ReferenceScopeEntity> scope, String query,
            ReferenceQueryPlan plan, OperationContext context, Supplier<List<ReferenceCandidateEntity>> vector,
            BiConsumer<String, ReferenceRecall.Branch> completed) {
        return execute(user, () -> recall.bm25(user, scope, query, plan), vector, context, System.nanoTime(),
                plan.workDeadlineNanos(), true, completed);
    }
    private ReferenceRecall.Pair execute(long user, Supplier<List<ReferenceCandidateEntity>> lexicalAction,
            Supplier<List<ReferenceCandidateEntity>> vectorAction, OperationContext context, long start, long deadline) {
        return execute(user, lexicalAction, vectorAction, context, start, deadline, false, null);
    }
    private ReferenceRecall.Pair execute(long user, Supplier<List<ReferenceCandidateEntity>> lexicalAction,
            Supplier<List<ReferenceCandidateEntity>> vectorAction, OperationContext context, long start, long deadline,
            boolean batch, BiConsumer<String, ReferenceRecall.Branch> completed) {
        ReferenceQueryPlan.checkCancellation();
        Future<ReferenceRecall.Branch> lexical = submit(user, "retrieval.bm25", lexicalAction, context, batch, completed);
        Future<ReferenceRecall.Branch> vector = submit(user, "retrieval.vector", vectorAction, context, batch, completed);
        try { return new ReferenceRecall.Pair(await(lexical, start, deadline), await(vector, start, deadline)); }
        finally { if (lexical != null) lexical.cancel(true); if (vector != null) vector.cancel(true); }
    }
    private Future<ReferenceRecall.Branch> submit(long user, String stage,
            Supplier<List<ReferenceCandidateEntity>> action, OperationContext context, boolean batch,
            BiConsumer<String, ReferenceRecall.Branch> completed) {
        try { return executor.submit(() -> branch(user, stage, action, context, batch, completed)); }
        catch (RejectedExecutionException error) { LOG.error("Reference recall rejected user={} stage={}", user, stage, error); return null; }
    }
    private ReferenceRecall.Branch branch(long user, String stage, Supplier<List<ReferenceCandidateEntity>> action,
            OperationContext context, boolean batch, BiConsumer<String, ReferenceRecall.Branch> completed) {
        long start = System.nanoTime();
        var child = context == null ? null : context.child("pg");
        try {
            var values = action.get();
            ReferenceQueryPlan.checkCancellation();
            String status = values.isEmpty() ? "empty" : "ready";
            if (child != null) child.finish(stage, values.isEmpty() ? "empty" : "success", Map.of("candidateCount", values.size()));
            return observed(stage, new ReferenceRecall.Branch(status, values, elapsed(start)), completed);
        } catch (RuntimeException error) {
            if (error instanceof java.util.concurrent.CancellationException || Thread.currentThread().isInterrupted()) {
                if (child != null) child.finish(stage, "cancelled", Map.of());
                throw new java.util.concurrent.CancellationException();
            }
            LOG.error("Reference recall failed user={} stage={}", user, stage, error);
            if (child != null) child.finish(stage, "degraded", Map.of());
            if (error instanceof com.interview.copilot.exception.ApiException api
                    && (batch ? List.of(401, 402, 403, 409).contains(api.status().value())
                    : List.of(401, 403, 429).contains(api.status().value()))) throw error;
            return observed(stage, new ReferenceRecall.Branch("degraded", List.of(), elapsed(start)), completed);
        }
    }
    private ReferenceRecall.Branch observed(String stage, ReferenceRecall.Branch branch,
            BiConsumer<String, ReferenceRecall.Branch> completed) {
        if (completed != null) completed.accept(stage, branch);
        return branch;
    }
    private ReferenceRecall.Branch await(Future<ReferenceRecall.Branch> future, long start, long deadline) {
        if (future == null) return new ReferenceRecall.Branch("degraded", List.of(), elapsed(start));
        try { return future.get(ReferenceQueryPlan.remainingNanos(deadline), TimeUnit.NANOSECONDS); }
        catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new java.util.concurrent.CancellationException(); }
        catch (TimeoutException error) { future.cancel(true); LOG.error("Reference recall timed out", error); return new ReferenceRecall.Branch("degraded", List.of(), elapsed(start)); }
        catch (ExecutionException error) { if (error.getCause() instanceof RuntimeException runtime) throw runtime; throw new IllegalStateException("资料召回失败。", error); }
    }
    private double elapsed(long start) { return (System.nanoTime() - start) / 1_000_000.0; }
    @PreDestroy public void close() { executor.shutdownNow(); }
}
