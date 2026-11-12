package com.interview.copilot.common.questions;

import reactor.core.publisher.Mono;
import reactor.core.publisher.Sinks;
import java.util.concurrent.CancellationException;
import java.util.concurrent.atomic.AtomicBoolean;

/** A bounded in-memory request, with an explicit cancel signal and idempotent cleanup. */
public final class QuestionRewriteWork implements AutoCloseable {
    private final Sinks.Empty<Void> cancelled = Sinks.empty();
    private final AtomicBoolean closed = new AtomicBoolean();
    private final Runnable release;

    public QuestionRewriteWork(Runnable release) {
        this.release = release;
    }

    public void cancel() {
        cancelled.tryEmitError(new CancellationException("Question rewrite cancelled"));
    }

    public Mono<Void> cancellation() {
        return cancelled.asMono();
    }

    @Override
    public void close() {
        if (closed.compareAndSet(false, true)) release.run();
    }
}
