package com.interview.copilot.security.asr;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * @author Carl Wang
 * @date 2026-09-21
 * @description 验证发送暂时积压恢复、硬上限和持续阻塞超时。
 */
class AsrSendQueueTest {
    @Test
    void enqueue_temporaryBacklogAboveOldLimit_drainsInOrderWithoutDropping() {
        List<Integer> sent = new ArrayList<>();
        List<String> errors = new ArrayList<>();
        CompletableFuture<Void> blocked = new CompletableFuture<>();
        AsrSendQueue queue = new AsrSendQueue(512000, Duration.ofSeconds(15), (reason, error) -> errors.add(reason));
        queue.enqueue(32000, () -> { sent.add(0); return blocked; });
        for (int index = 1; index < 7; index++) {
            int number = index;
            queue.enqueue(32000, () -> { sent.add(number); return CompletableFuture.completedFuture(null); });
        }
        assertThat(queue.pendingBytes()).isEqualTo(224000);
        assertThat(sent).containsExactly(0);
        blocked.complete(null);
        assertThat(sent).containsExactly(0, 1, 2, 3, 4, 5, 6);
        assertThat(queue.pendingBytes()).isZero();
        assertThat(errors).isEmpty();
    }

    @Test
    void enqueue_overStorageLimit_rejectsWithoutGrowingQueue() {
        List<String> errors = new ArrayList<>();
        CompletableFuture<Void> blocked = new CompletableFuture<>();
        AsrSendQueue queue = new AsrSendQueue(512000, Duration.ofSeconds(15), (reason, error) -> errors.add(reason));
        queue.enqueue(512000, () -> blocked);
        queue.enqueue(2, () -> { throw new AssertionError("Must not send overflow"); });
        assertThat(errors).containsExactly("upstream_send_backpressure");
        assertThat(queue.pendingBytes()).isEqualTo(512000);
        blocked.complete(null);
    }

    @Test
    void enqueue_stalledTransport_failsAndDoesNotSendLaterAudio() throws Exception {
        CompletableFuture<String> failed = new CompletableFuture<>();
        AsrSendQueue queue = new AsrSendQueue(512000, Duration.ofMillis(50),
                (reason, error) -> failed.complete(reason));
        queue.enqueue(32, CompletableFuture::new);
        queue.enqueue(32, () -> { throw new AssertionError("Cannot send after failed predecessor"); });
        assertThat(failed.get(2, TimeUnit.SECONDS)).isEqualTo("upstream_send_error_or_timeout");
    }
}
