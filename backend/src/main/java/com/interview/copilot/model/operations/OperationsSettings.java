package com.interview.copilot.model.operations;

import java.util.List;

public record OperationsSettings(long version, boolean enabled, List<String> allowedUserIds,
        Thresholds thresholds) {
    public OperationsSettings {
        allowedUserIds = allowedUserIds == null ? List.of() : List.copyOf(allowedUserIds);
        thresholds = thresholds == null ? Thresholds.defaults() : thresholds;
    }
    public static OperationsSettings disabled() {
        return new OperationsSettings(0, false, List.of(), Thresholds.defaults());
    }
    public boolean allows(long user) {
        return enabled && (allowedUserIds.isEmpty() || allowedUserIds.contains(Long.toString(user)));
    }
    public record Thresholds(double firstContentP95Ms, double errorRate, double degradedRate,
            double connectionUtilization, int minSamples, int sustainSeconds) {
        public static Thresholds defaults() {
            return new Thresholds(8000, 0.05, 0.1, 0.8, 20, 300);
        }
    }
}
