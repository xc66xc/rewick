package com.interview.copilot.model.references;

import java.util.List;

public final class ReferenceRerank {
    private ReferenceRerank() {}

    public record Result(List<ReferenceRecall.Fused> candidates, boolean enabled, String status,
            String reason, String model, double durationMs, int submittedCount) {
        public Result(List<ReferenceRecall.Fused> candidates, boolean enabled, String status,
                String reason, String model, double durationMs) {
            this(candidates, enabled, status, reason, model, durationMs, 0);
        }

        public Result {
            candidates = List.copyOf(candidates);
        }
    }
}
