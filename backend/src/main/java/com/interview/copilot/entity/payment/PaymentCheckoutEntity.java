package com.interview.copilot.entity.payment;

import java.time.LocalDateTime;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 支付宝电脑网站收银台处理。
 */
public record PaymentCheckoutEntity(
        long id, String orderId, boolean consumed, LocalDateTime expiresAt) {}
