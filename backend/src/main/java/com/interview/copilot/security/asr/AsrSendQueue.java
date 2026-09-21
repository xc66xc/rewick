package com.interview.copilot.security.asr;

import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.BiConsumer;
import java.util.function.Supplier;

/**
 * @author Carl Wang
 * @date 2026-09-21
 * @description 有界串行发送音频，限制从入队到发送完成的总等待时间。
 */
final class AsrSendQueue {
    private final int maximumBytes;
    private final Duration timeout;
    private final BiConsumer<String, Throwable> failure;
    private final AtomicInteger pending = new AtomicInteger();
    private final ReentrantLock lock = new ReentrantLock();
    private CompletableFuture<Void> tail = CompletableFuture.completedFuture(null);

    AsrSendQueue(int maximumBytes, Duration timeout, BiConsumer<String, Throwable> failure) {
        this.maximumBytes = maximumBytes;
        this.timeout = timeout;
        this.failure = failure;
    }

    int pendingBytes() { return pending.get(); }

    void enqueue(int bytes, Supplier<CompletableFuture<?>> send) {
        if (pending.addAndGet(bytes) > maximumBytes) {
            pending.addAndGet(-bytes);
            failure.accept("upstream_send_backpressure", null);
            return;
        }
        lock.lock();
        try {
            tail = tail.thenCompose(ignored -> send.get().thenApply(value -> (Void) null))
                    .orTimeout(timeout.toMillis(), TimeUnit.MILLISECONDS);
            tail.whenComplete((ignored, error) -> {
                pending.addAndGet(-bytes);
                if (error != null) failure.accept("upstream_send_error_or_timeout", error);
            });
        } finally {
            lock.unlock();
        }
    }
}
