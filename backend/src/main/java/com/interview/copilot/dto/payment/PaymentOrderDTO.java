package com.interview.copilot.dto.payment;

import java.time.Instant;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 渠道订单请求；ZPAY 下单额外携带创建时采集的客户端 IP。
 */
public record PaymentOrderDTO(
        String id,
        long userId,
        String packageName,
        long durationSeconds,
        int totalCents,
        Instant expiresAt,
        String clientIp) {
    public PaymentOrderDTO(String id, long userId, String packageName, long durationSeconds,
            int totalCents, Instant expiresAt) {
        // Query/close and channels without an IP requirement need no client address.
        this(id, userId, packageName, durationSeconds, totalCents, expiresAt, "");
    }
}
