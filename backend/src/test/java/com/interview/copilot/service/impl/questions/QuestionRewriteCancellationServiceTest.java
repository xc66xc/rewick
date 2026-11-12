package com.interview.copilot.service.impl.questions;

import org.junit.jupiter.api.Test;
import java.util.ArrayList;
import java.util.concurrent.CancellationException;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class QuestionRewriteCancellationServiceTest {
    @Test
    void register_fifthRequest_returnsBusyWithoutQueueAndCleanupRestoresCapacity() {
        var registry = new QuestionRewriteCancellationServiceImpl();
        var work = new ArrayList<com.interview.copilot.common.questions.QuestionRewriteWork>();
        for (int i = 0; i < 4; i++) work.add(registry.register(1, "request-" + i).orElseThrow());
        assertThat(registry.register(1, "fifth")).isEmpty();
        work.getFirst().close();
        work.getFirst().close();
        try (var replacement = registry.register(1, "replacement").orElseThrow()) {
            assertThat(registry.register(1, "sixth")).isEmpty();
        }
        work.forEach(com.interview.copilot.common.questions.QuestionRewriteWork::close);
    }

    @Test
    void cancel_beforeRequest_rejectsSameUserButDoesNotCancelAnotherUser() {
        var registry = new QuestionRewriteCancellationServiceImpl();
        registry.cancel(1, "request");
        assertThatThrownBy(() -> registry.register(1, "request")).isInstanceOf(CancellationException.class);
        try (var other = registry.register(2, "request").orElseThrow()) {
            assertThat(other.cancellation().toFuture().isDone()).isFalse();
        }
    }

    @Test
    void cancel_runningRequest_deliversCancellationSignal() {
        var registry = new QuestionRewriteCancellationServiceImpl();
        try (var work = registry.register(1, "request").orElseThrow()) {
            registry.cancel(2, "request");
            registry.cancel(1, "request");
            assertThatThrownBy(() -> work.cancellation().block()).isInstanceOf(CancellationException.class);
        }
    }
}
