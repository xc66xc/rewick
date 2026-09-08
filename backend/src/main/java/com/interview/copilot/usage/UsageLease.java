package com.interview.copilot.usage;

import java.util.concurrent.atomic.AtomicBoolean;

/** A resource reservation, not a supplier-cost or payment ledger. */
public final class UsageLease implements AutoCloseable {
    private final UsageService service;
    private final long userId;
    private final String requestId;
    private final String capability;
    private final AtomicBoolean finished = new AtomicBoolean();

    UsageLease(UsageService service, long userId, String requestId, String capability) {
        this.service = service;
        this.userId = userId;
        this.requestId = requestId;
        this.capability = capability;
    }

    public void complete() { finish("complete"); }
    public void fail() { finish("failed"); }
    public void cancel() { finish("cancelled"); }
    @Override
    public void close() { cancel(); }

    private void finish(String status) {
        if (!finished.compareAndSet(false, true)) return;
        try {
            service.finish(userId, requestId, capability, status);
        } catch (RuntimeException error) {
            finished.set(false);
            throw error;
        }
    }
}
