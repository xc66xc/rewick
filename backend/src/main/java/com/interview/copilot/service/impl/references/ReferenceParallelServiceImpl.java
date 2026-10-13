package com.interview.copilot.service.impl.references;

import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.entity.references.ReferenceScopeEntity;
import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import com.interview.copilot.model.references.ReferenceRecall;
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
        Future<ReferenceRecall.Branch> lexical = submit(user, "retrieval.bm25", () -> recall.bm25(user, scope, query, policy), context);
        Future<ReferenceRecall.Branch> vector = submit(user, "retrieval.vector", () -> recall.vector(user, scope, query, policy, context), context);
        try { return new ReferenceRecall.Pair(await(lexical, start), await(vector, start)); }
        finally { if (lexical != null) lexical.cancel(true); if (vector != null) vector.cancel(true); }
    }
    private Future<ReferenceRecall.Branch> submit(long user, String stage,
            Supplier<List<ReferenceCandidateEntity>> action, OperationContext context) {
        try { return executor.submit(() -> branch(user, stage, action, context)); }
        catch (RejectedExecutionException error) { LOG.error("Reference recall rejected user={} stage={}", user, stage, error); return null; }
    }
    private ReferenceRecall.Branch branch(long user, String stage, Supplier<List<ReferenceCandidateEntity>> action, OperationContext context) {
        long start = System.nanoTime();
        var child = context == null ? null : context.child("pg");
        try {
            var values = action.get();
            String status = values.isEmpty() ? "empty" : "ready";
            if (child != null) child.finish(stage, values.isEmpty() ? "empty" : "success", Map.of("candidateCount", values.size()));
            return new ReferenceRecall.Branch(status, values, elapsed(start));
        } catch (RuntimeException error) {
            if (error instanceof java.util.concurrent.CancellationException) {
                if (child != null) child.finish(stage, "cancelled", Map.of());
                throw error;
            }
            LOG.error("Reference recall failed user={} stage={}", user, stage, error);
            if (child != null) child.finish(stage, "degraded", Map.of());
            if (error instanceof com.interview.copilot.exception.ApiException api
                    && (api.status().value() == 401 || api.status().value() == 403 || api.status().value() == 429)) throw error;
            return new ReferenceRecall.Branch("degraded", List.of(), elapsed(start));
        }
    }
    private ReferenceRecall.Branch await(Future<ReferenceRecall.Branch> future, long start) {
        if (future == null) return new ReferenceRecall.Branch("degraded", List.of(), elapsed(start));
        try { return future.get(Math.max(1, 30000 - (long) elapsed(start)), TimeUnit.MILLISECONDS); }
        catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new java.util.concurrent.CancellationException(); }
        catch (TimeoutException error) { future.cancel(true); LOG.error("Reference recall timed out", error); return new ReferenceRecall.Branch("degraded", List.of(), elapsed(start)); }
        catch (ExecutionException error) { if (error.getCause() instanceof RuntimeException runtime) throw runtime; throw new IllegalStateException("资料召回失败。", error); }
    }
    private double elapsed(long start) { return (System.nanoTime() - start) / 1_000_000.0; }
    @PreDestroy public void close() { executor.shutdownNow(); }
}
