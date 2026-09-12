package com.interview.copilot.common.ai;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.interview.copilot.exception.ApiException;

import org.junit.jupiter.api.Test;

public class LlmConcurrencyTest {
    @Test
    void acquire_perUserLimit_otherUserCanProceedAndClosedSlotsAreReusable() {
        LlmConcurrency capacity = new LlmConcurrency();
        try (var first = capacity.acquire(1, 8);
                var second = capacity.acquire(1, 8)) {
            assertThatThrownBy(() -> capacity.acquire(1, 8)).isInstanceOf(ApiException.class);
            try (var other = capacity.acquire(2, 8)) {
                other.close();
            }
        }
        try (var reused = capacity.acquire(1, 8)) {
            reused.close();
        }
    }

    @Test
    void acquire_globalLimit_releaseRestoresCapacity() {
        LlmConcurrency capacity = new LlmConcurrency();
        try (var first = capacity.acquire(1, 1)) {
            assertThatThrownBy(() -> capacity.acquire(2, 1)).isInstanceOf(ApiException.class);
        }
        try (var reused = capacity.acquire(2, 1)) {
            reused.close();
        }
    }
}
