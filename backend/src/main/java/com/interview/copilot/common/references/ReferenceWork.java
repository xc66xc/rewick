package com.interview.copilot.common.references;

/** An owned request registration; closing releases its bounded cancellation slot. */
public final class ReferenceWork implements AutoCloseable {
    private final Runnable release;
    private final java.util.concurrent.atomic.AtomicBoolean closed = new java.util.concurrent.atomic.AtomicBoolean();
    public ReferenceWork(Runnable release) { this.release = release; }
    @Override public void close() { if (closed.compareAndSet(false,true)) release.run(); }
}
