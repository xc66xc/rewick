package com.interview.copilot.model.references;

import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.model.platform.PlatformSnapshot;
import java.util.concurrent.CancellationException;
import java.util.concurrent.TimeUnit;

/** Immutable policy, provider configuration and monotonic budgets for one retrieval. */
public record ReferenceQueryPlan(ReferencePolicy policy, PlatformSnapshot snapshot,
        long deadlineNanos, long workDeadlineNanos) {
    public static ReferenceQueryPlan start(ReferencePolicy policy, PlatformSnapshot snapshot) {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(28);
        return new ReferenceQueryPlan(policy, snapshot, deadline, deadline - TimeUnit.MILLISECONDS.toNanos(1500));
    }
    public static void checkCancellation() {
        if (Thread.currentThread().isInterrupted()) throw new CancellationException();
    }
    public static long remainingNanos(long deadline) {
        checkCancellation();
        return Math.max(0, deadline - System.nanoTime());
    }
    public static int timeoutMillis(long deadline, int maximum) {
        long remaining = remainingNanos(deadline);
        if (remaining <= 0) throw new IllegalStateException("资料检索时间预算已用尽。");
        return (int) Math.max(1, Math.min(maximum, TimeUnit.NANOSECONDS.toMillis(remaining)));
    }
}
