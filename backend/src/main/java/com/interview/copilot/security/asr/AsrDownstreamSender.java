package com.interview.copilot.security.asr;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import java.io.IOException;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.BooleanSupplier;

/** Serializes actual caption/terminal sends and normal close; a transport stall cannot hold termination forever. */
final class AsrDownstreamSender {
    private static final Logger LOG = LoggerFactory.getLogger(AsrDownstreamSender.class);
    private final WebSocketSession session;
    private final BooleanSupplier ended;
    private final long waitMillis;
    private final ReentrantLock gate = new ReentrantLock();

    AsrDownstreamSender(WebSocketSession session, BooleanSupplier ended) {
        this(session, ended, Duration.ofSeconds(5));
    }

    AsrDownstreamSender(WebSocketSession session, BooleanSupplier ended, Duration wait) {
        this.session = session;
        this.ended = ended;
        waitMillis = wait.toMillis();
        if (waitMillis < 1) throw new IllegalArgumentException("ASR send gate requires a positive budget");
    }

    void send(String message) throws IOException {
        try {
            if (!gate.tryLock(waitMillis, TimeUnit.MILLISECONDS)) throw new IOException("ASR downstream send gate timed out");
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IOException("ASR downstream send interrupted", error);
        }
        try {
            if (!ended.getAsBoolean() && session.isOpen()) session.sendMessage(new TextMessage(message));
        } finally {
            gate.unlock();
        }
    }

    void terminal(String message) {
        boolean acquired = false;
        try {
            acquired = gate.tryLock(waitMillis, TimeUnit.MILLISECONDS);
            if (!acquired) {
                LOG.debug("ASR downstream terminal gate timed out connection={}", session.getId());
                close(CloseStatus.SESSION_NOT_RELIABLE);
                return;
            }
            sendAndClose(message);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            close(CloseStatus.SESSION_NOT_RELIABLE);
        } finally {
            if (acquired) gate.unlock();
        }
    }

    private void sendAndClose(String message) {
        try {
            if (message != null && session.isOpen()) session.sendMessage(new TextMessage(message));
        } catch (IOException | IllegalStateException error) {
            LOG.debug("ASR terminal transport unavailable connection={}", session.getId());
        } finally {
            close(CloseStatus.NORMAL);
        }
    }

    private void close(CloseStatus status) {
        try {
            if (session.isOpen()) session.close(status);
        } catch (IOException | IllegalStateException error) {
            LOG.debug("ASR downstream transport already unavailable connection={}", session.getId());
        }
    }
}
