package com.interview.copilot.model.references;

import com.interview.copilot.response.references.ReferenceHybridResponse;
import java.util.List;

/** Immutable query result before the batch-wide evidence budget is applied. */
public record ReferenceBatchSelection(String questionId, String status, String message,
        List<ReferenceRecall.Fused> candidates, ReferenceHybridResponse hybrid) {
    public ReferenceBatchSelection { candidates = List.copyOf(candidates); }
}
