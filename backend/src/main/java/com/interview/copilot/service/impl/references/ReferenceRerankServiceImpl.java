package com.interview.copilot.service.impl.references;

import com.interview.copilot.common.references.ReferenceRerankInput;
import com.interview.copilot.exception.ai.ProviderFailure;
import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.model.platform.PlatformSnapshot;
import com.interview.copilot.model.references.ReferenceRecall;
import com.interview.copilot.model.references.ReferenceRerank;
import com.interview.copilot.service.references.ReferenceRerankService;
import com.interview.copilot.util.ai.ProviderFailureClassifier;
import com.interview.copilot.util.rerank.BailianRerankClient;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CancellationException;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class ReferenceRerankServiceImpl implements ReferenceRerankService {
    private static final Logger LOG = LoggerFactory.getLogger(ReferenceRerankServiceImpl.class);
    private final BailianRerankClient client;

    public ReferenceRerankServiceImpl(BailianRerankClient client) {
        this.client = client;
    }

    @Override
    public ReferenceRerank.Result rank(String query, List<ReferenceRecall.Fused> candidates,
            PlatformSnapshot snapshot, long deadlineNanos, OperationContext observation) {
        String model = snapshot == null ? "" : snapshot.view().rerank().model();
        var stage = observation == null ? null : observation.child("rerank").provider("rerank", model);
        var attempt = new Attempt(stage, System.nanoTime(), model, snapshot == null ? 0 : snapshot.view().version(),
                new AtomicInteger());
        try {
            BailianRerankClient.requireActive();
            return execute(query, candidates, snapshot, deadlineNanos, attempt);
        } catch (CancellationException error) {
            finish(attempt, "cancelled", "cancelled");
            throw error;
        } catch (RuntimeException error) {
            return failure(error, candidates, attempt);
        }
    }

    private ReferenceRerank.Result execute(String query, List<ReferenceRecall.Fused> candidates,
            PlatformSnapshot snapshot, long deadlineNanos, Attempt attempt) {
        if (snapshot == null) return result(candidates, false, "degraded", "unavailable", attempt);
        if (!snapshot.view().rerank().enabled()) return result(candidates, false, "disabled", null, attempt);
        if (candidates.size() < 2) return result(candidates, true, "skipped", null, attempt);
        var documents = ReferenceRerankInput.documents(query, candidates, attempt.model());
        var scores = client.rank(snapshot.rerank(), query, documents, deadlineNanos,
                () -> attempt.submittedCount().set(candidates.size()));
        List<ReferenceRecall.Fused> ranked = new ArrayList<>();
        for (var score : scores) ranked.add(candidates.get(score.index()).withRerank(ranked.size() + 1, score.value()));
        return result(ranked, true, "ready", null, attempt);
    }

    private ReferenceRerank.Result failure(RuntimeException error, List<ReferenceRecall.Fused> candidates,
            Attempt attempt) {
        try {
            BailianRerankClient.requireActive(error);
        } catch (CancellationException cancellation) {
            finish(attempt, "cancelled", "cancelled");
            throw cancellation;
        }
        ProviderFailure failure = ProviderFailureClassifier.classify(error);
        String reason = reason(failure.reason());
        recordFailure(failure, reason, candidates.size(), attempt);
        String status = "input_limit".equals(reason) ? "skipped" : "degraded";
        return result(candidates, true, status, reason, attempt);
    }

    private void recordFailure(ProviderFailure failure, String reason, int count, Attempt attempt) {
        String operation = attempt.observation() == null ? "unavailable" : attempt.observation().operationId();
        if (Set.of("input_limit", "queue_full", "invalid_input", "unavailable").contains(reason)) {
            LOG.warn("Reference rerank fallback reason={} operationId={} candidates={}", reason, operation, count);
            return;
        }
        LOG.error("[error] Reference rerank provider failure reason={} operationId={} candidates={}",
                reason, operation, count, failure);
    }

    private String reason(String value) {
        return switch (value) {
            case "timeout", "queue_full", "unavailable", "invalid_input", "input_limit", "protocol_error" -> value;
            case "invalid_json", "empty_response", "response_too_large" -> "protocol_error";
            default -> "provider_error";
        };
    }

    private ReferenceRerank.Result result(List<ReferenceRecall.Fused> candidates, boolean enabled,
            String status, String reason, Attempt attempt) {
        BailianRerankClient.requireActive();
        String outcome = "ready".equals(status) ? "success" : "disabled".equals(status) ? "skipped" : status;
        if ("timeout".equals(reason)) outcome = "timeout";
        finish(attempt, outcome, reason);
        return new ReferenceRerank.Result(candidates, enabled, status, reason, attempt.model(), elapsed(attempt.started()),
                attempt.submittedCount().get());
    }

    private void finish(Attempt attempt, String outcome, String reason) {
        if (attempt.observation() != null) attempt.observation().finish("retrieval.rerank", outcome,
                reason, Map.of("candidateCount", attempt.submittedCount().get(), "platformVersion", attempt.version()));
    }

    private double elapsed(long started) {
        return (System.nanoTime() - started) / 1_000_000.0;
    }

    private record Attempt(OperationContext observation, long started, String model, long version,
            AtomicInteger submittedCount) {}
}
