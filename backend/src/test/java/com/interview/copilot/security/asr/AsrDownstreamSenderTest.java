package com.interview.copilot.security.asr;

import org.junit.jupiter.api.Test;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AsrDownstreamSenderTest {
    private final WebSocketSession session = mock(WebSocketSession.class);
    private final AtomicBoolean ended = new AtomicBoolean();

    @Test
    void terminal_stalledCaption_expiresGateBudgetAndClosesUnreliableTransport() throws Exception {
        CountDownLatch captionSending = new CountDownLatch(1);
        CountDownLatch releaseCaption = new CountDownLatch(1);
        CountDownLatch closed = new CountDownLatch(1);
        AtomicBoolean open = new AtomicBoolean(true);
        when(session.isOpen()).thenAnswer(call -> open.get());
        doAnswer(call -> { captionSending.countDown(); releaseCaption.await(); return null; }).when(session).sendMessage(any());
        doAnswer(call -> { open.set(false); closed.countDown(); return null; }).when(session).close(any(CloseStatus.class));
        var sender = new AsrDownstreamSender(session, ended::get, Duration.ofMillis(50));
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var caption = executor.submit(() -> { sender.send("caption"); return null; });
            try {
                assertThat(captionSending.await(3, TimeUnit.SECONDS)).isTrue();
                ended.set(true);
                var terminal = executor.submit(() -> sender.terminal("task-failed"));
                terminal.get(3, TimeUnit.SECONDS);
                assertThat(closed.getCount()).isZero();
                verify(session).close(CloseStatus.SESSION_NOT_RELIABLE);
                verify(session, never()).sendMessage(new TextMessage("task-failed"));
            } finally {
                releaseCaption.countDown();
                caption.get(3, TimeUnit.SECONDS);
            }
        }
    }

    @Test
    void send_terminalReachedWhileWaiting_rechecksEndedInsideGateAndDropsLateCaption() throws Exception {
        CountDownLatch captionSending = new CountDownLatch(1);
        CountDownLatch releaseCaption = new CountDownLatch(1);
        CountDownLatch lateStarted = new CountDownLatch(1);
        List<String> sent = new CopyOnWriteArrayList<>();
        when(session.isOpen()).thenReturn(true);
        doAnswer(call -> {
            String payload = ((TextMessage) call.getArgument(0)).getPayload();
            sent.add(payload);
            if (payload.equals("first")) { captionSending.countDown(); releaseCaption.await(); }
            return null;
        }).when(session).sendMessage(any());
        var sender = new AsrDownstreamSender(session, ended::get);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var first = executor.submit(() -> { sender.send("first"); return null; });
            java.util.concurrent.Future<?> late = null;
            try {
                assertThat(captionSending.await(3, TimeUnit.SECONDS)).isTrue();
                late = executor.submit(() -> { lateStarted.countDown(); sender.send("late"); return null; });
                assertThat(lateStarted.await(3, TimeUnit.SECONDS)).isTrue();
                ended.set(true);
                releaseCaption.countDown();
                first.get(3, TimeUnit.SECONDS);
                late.get(3, TimeUnit.SECONDS);
                sender.terminal("task-failed");
                sender.send("after-terminal");
                assertThat(sent).containsExactly("first", "task-failed");
            } finally {
                releaseCaption.countDown();
                first.get(3, TimeUnit.SECONDS);
                if (late != null) late.get(3, TimeUnit.SECONDS);
            }
        }
    }
}
