package com.interview.copilot.security.asr;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.common.usage.UsageLease;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.exception.ai.ProviderErrors;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.util.asr.AsrProtocol;

import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;

import java.io.IOException;
import java.net.URI;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantLock;

public final class AsrBridge {
    private final WebSocketSession downstream;
    private final UserPrincipal user;
    private final AsrProxy resources;
    private final Runnable release;
    private final AtomicBoolean ended = new AtomicBoolean();
    private final AtomicInteger pendingBytes = new AtomicInteger();
    private final ReentrantLock sendLock = new ReentrantLock();
    private final String upstreamId = UUID.randomUUID().toString();
    private volatile String clientId = "platform";
    private volatile String phase = "new";
    private volatile WebSocket upstream;
    private volatile UsageLease lease;
    private volatile CompletableFuture<WebSocket> connecting;
    private CompletableFuture<WebSocket> outgoing = CompletableFuture.completedFuture(null);
    private volatile ScheduledFuture<?> deadline;
    private volatile ScheduledFuture<?> phaseDeadline;
    private long lastAudioNanos = System.nanoTime();
    private double audioAllowance = 128000;

    public AsrBridge(
            WebSocketSession downstream, UserPrincipal user, AsrProxy resources, Runnable release) {
        this.downstream = new ConcurrentWebSocketSessionDecorator(downstream, 5000, 128000);
        this.user = user;
        this.resources = resources;
        this.release = release;
        phaseDeadline = resources.timers().schedule(this::fail, 10, TimeUnit.SECONDS);
    }

    public void text(String value) {
        if (ended.get()) {
            return;
        }
        try {
            JsonNode frame = resources.json().parse(value);
            String taskId = AsrProtocol.taskId(frame);
            String action = frame.path("header").path("action").asText();
            if ("new".equals(phase) && "run-task".equals(action)) {
                run(frame, taskId);
                return;
            }
            if ("running".equals(phase)
                    && "finish-task".equals(action)
                    && clientId.equals(taskId)) {
                finish();
                return;
            }
            fail();
        } catch (RuntimeException exception) {
            fail();
        }
    }

    private void run(JsonNode frame, String taskId) {
        ProviderProperties.Asr config = resources.config(user.id(), downstream.getUri());
        if (!config.isEnabled()) {
            throw ProviderErrors.unavailable();
        }
        Map<String, Object> request = AsrProtocol.run(frame, upstreamId, config.getModel());
        clientId = taskId;
        String requestId = requestId();
        lease = resources.usage().startForSession(user.id(), requestId, "asr", user.tokenId());
        lease.watch(() -> close("cancel"));
        resources.usage().describeModel(user.id(), requestId, "asr", config.getModel());
        if (ended.get()) {
            lease.cancel();
            return;
        }
        phase = "connecting";
        phaseDeadline.cancel(false);
        phaseDeadline = resources.timers().schedule(this::fail, 15, TimeUnit.SECONDS);
        deadline =
                resources
                        .timers()
                        .schedule(this::fail, resources.maximumSeconds(config), TimeUnit.SECONDS);
        String payload = resources.json().encode(request);
        connecting =
                resources
                        .client()
                        .newWebSocketBuilder()
                        .connectTimeout(Duration.ofSeconds(10))
                        .header("Authorization", "Bearer " + config.getApiKey())
                        .buildAsync(
                                URI.create(config.getUrl()),
                                new AsrUpstreamListener(this, payload));
        connecting.whenComplete(
                (socket, error) -> {
                    if (error != null) {
                        fail();
                    } else if (ended.get()) {
                        socket.abort();
                    }
                });
    }

    private String requestId() {
        String value = downstream.getHandshakeHeaders().getFirst("X-Request-Id");
        return com.interview.copilot.validation.ai.LlmRequestPolicy.requestId(value);
    }

    void opened(WebSocket socket, String runPayload) {
        upstream = socket;
        if (ended.get()) {
            socket.abort();
            return;
        }
        enqueue(ByteBuffer.wrap(new byte[0]), runPayload);
    }

    public void binary(ByteBuffer value) {
        if (ended.get()) {
            return;
        }
        int size = value.remaining();
        if (!"running".equals(phase)
                || size == 0
                || size > 65536
                || size % 2 != 0
                || !acceptRate(size)) {
            fail();
            return;
        }
        ByteBuffer copy = ByteBuffer.allocate(size);
        copy.put(value).flip();
        enqueue(copy, null);
    }

    private boolean acceptRate(int bytes) {
        long now = System.nanoTime();
        audioAllowance =
                Math.min(128000, audioAllowance + (now - lastAudioNanos) / 1000000000.0 * 40000);
        lastAudioNanos = now;
        if (bytes > audioAllowance) {
            return false;
        }
        audioAllowance -= bytes;
        return true;
    }

    private void enqueue(ByteBuffer audio, String text) {
        int size = text == null ? audio.remaining() : text.length() * 2;
        if (pendingBytes.addAndGet(size) > 128000) {
            fail();
            return;
        }
        sendLock.lock();
        try {
            outgoing = outgoing.thenCompose(previous -> send(audio, text));
            outgoing.whenComplete(
                    (socket, error) -> {
                        pendingBytes.addAndGet(-size);
                        if (error != null) {
                            fail();
                        }
                    });
        } finally {
            sendLock.unlock();
        }
    }

    private CompletableFuture<WebSocket> send(ByteBuffer audio, String text) {
        WebSocket socket = upstream;
        if (ended.get() || socket == null) {
            return CompletableFuture.failedFuture(ProviderErrors.failed());
        }
        return text == null ? socket.sendBinary(audio, true) : socket.sendText(text, true);
    }

    private void finish() {
        phase = "stopping";
        phaseDeadline = resources.timers().schedule(this::fail, 8, TimeUnit.SECONDS);
        enqueue(
                ByteBuffer.wrap(new byte[0]),
                resources.json().encode(AsrProtocol.finish(upstreamId)));
    }

    void received(String value) {
        if (ended.get()) {
            return;
        }
        try {
            JsonNode frame = resources.json().parse(value);
            if (!upstreamId.equals(frame.path("header").path("task_id").asText())) {
                fail();
                return;
            }
            String event = frame.path("header").path("event").asText();
            if ("task-started".equals(event) && "connecting".equals(phase)) {
                phase = "running";
                phaseDeadline.cancel(false);
            }
            if ("task-finished".equals(event) && !"stopping".equals(phase)) {
                fail();
                return;
            }
            String message = resources.json().encode(AsrProtocol.event(frame, clientId));
            if ("task-finished".equals(event)) {
                terminate("complete", message);
                return;
            }
            downstream.sendMessage(new TextMessage(message));
        } catch (IOException | RuntimeException exception) {
            fail();
        }
    }

    void fail() {
        terminate("fail", resources.json().encode(AsrProtocol.failure(clientId)));
    }

    public void close(String outcome) {
        terminate(outcome, null);
    }

    private void terminate(String outcome, String message) {
        if (!ended.compareAndSet(false, true)) {
            return;
        }
        stopUpstream();
        String terminalMessage = finalizeUsage(outcome, message);
        release.run();
        try {
            sendTerminal(terminalMessage);
        } finally {
            closeDownstream();
        }
    }

    private void stopUpstream() {
        if (deadline != null) {
            deadline.cancel(false);
        }
        if (phaseDeadline != null) {
            phaseDeadline.cancel(false);
        }
        if (connecting != null && !connecting.isDone()) {
            connecting.cancel(true);
        }
        if (upstream != null) {
            upstream.abort();
        }
    }

    private String finalizeUsage(String outcome, String message) {
        try {
            endUsage(outcome);
            return message;
        } catch (RuntimeException exception) {
            org.slf4j.LoggerFactory.getLogger(AsrBridge.class)
                    .error("ASR usage finalization failed for user {}", user.id());
            return resources.json().encode(AsrProtocol.failure(clientId));
        }
    }

    private void sendTerminal(String message) {
        if (message == null || !downstream.isOpen()) {
            return;
        }
        try {
            downstream.sendMessage(new TextMessage(message));
        } catch (IOException | IllegalStateException exception) {
            org.slf4j.LoggerFactory.getLogger(AsrBridge.class)
                    .debug("ASR terminal transport unavailable for user {}", user.id());
        }
    }

    private void closeDownstream() {
        try {
            if (downstream.isOpen()) {
                downstream.close(CloseStatus.NORMAL);
            }
        } catch (IOException exception) {
            // The transport is already unavailable; aborting upstream above is the cleanup
            // guarantee.
            org.slf4j.LoggerFactory.getLogger(AsrBridge.class)
                    .debug("ASR transport already closed for user {}", user.id());
        }
    }

    private void endUsage(String outcome) {
        if (lease == null) {
            return;
        }
        switch (outcome) {
            case "complete" -> lease.complete();
            case "fail" -> lease.fail();
            default -> lease.cancel();
        }
    }
}
