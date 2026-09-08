package com.interview.copilot.ai;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

public class LlmConcurrency {
    private final AtomicInteger total = new AtomicInteger();
    private final ConcurrentHashMap<Long, Integer> users = new ConcurrentHashMap<>();

    public Permit acquire(long userId, int maximum) {
        if (total.incrementAndGet() > maximum) {
            total.decrementAndGet();
            throw ProviderErrors.busy();
        }
        AtomicBoolean accepted = new AtomicBoolean();
        users.compute(userId, (key, count) -> {
            int value = count == null ? 0 : count;
            if (value >= 2) { return value; }
            accepted.set(true);
            return value + 1;
        });
        if (!accepted.get()) {
            total.decrementAndGet();
            throw ProviderErrors.busy();
        }
        return new Permit(() -> release(userId));
    }

    private void release(long userId) {
        users.computeIfPresent(userId, (key, count) -> count > 1 ? count - 1 : null);
        total.decrementAndGet();
    }

    public static final class Permit implements AutoCloseable {
        private final AtomicBoolean closed = new AtomicBoolean();
        private final Runnable release;
        private Permit(Runnable release) { this.release = release; }
        @Override public void close() { if (closed.compareAndSet(false, true)) { release.run(); } }
    }
}
