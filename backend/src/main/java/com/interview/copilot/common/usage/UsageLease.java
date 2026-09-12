package com.interview.copilot.common.usage;

import com.interview.copilot.service.usage.UsageService;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** A resource reservation, not a supplier-cost or payment ledger. */
public final class UsageLease implements AutoCloseable {
    private final UsageService service;
    private final long userId;
    private final String requestId;
    private final String capability;
    private final String sessionId;
    private final AtomicBoolean finished = new AtomicBoolean();
    private static final ScheduledExecutorService MONITOR =
            Executors.newScheduledThreadPool(
                    2, Thread.ofPlatform().daemon().name("interview-lease-", 0).factory());
    private volatile ScheduledFuture<?> monitor;

    public UsageLease(
            UsageService service,
            long userId,
            String requestId,
            String capability,
            String sessionId) {
        this.service = service;
        this.userId = userId;
        this.requestId = requestId;
        this.capability = capability;
        this.sessionId = sessionId;
    }

    public boolean isActive() {
        return !finished.get() && service.active(userId, sessionId);
    }

    public void watch(Runnable onExpired) {
        monitor =
                MONITOR.scheduleWithFixedDelay(
                        () -> {
                            if (finished.get()) return;
                            try {
                                if (!isActive()) onExpired.run();
                            } catch (RuntimeException error) {
                                org.slf4j.LoggerFactory.getLogger(UsageLease.class)
                                        .warn(
                                                "Interview lease check failed for user {}",
                                                userId,
                                                error);
                                onExpired.run();
                            }
                        },
                        1,
                        1,
                        TimeUnit.SECONDS);
        if (finished.get()) monitor.cancel(false);
    }

    public void complete() {
        finish("complete");
    }

    public void fail() {
        finish("failed");
    }

    public void cancel() {
        finish("cancelled");
    }

    @Override
    public void close() {
        cancel();
    }

    private void finish(String status) {
        if (!finished.compareAndSet(false, true)) return;
        if (monitor != null) monitor.cancel(false);
        try {
            service.finish(userId, requestId, capability, status);
        } catch (RuntimeException error) {
            finished.set(false);
            throw error;
        }
    }
}
