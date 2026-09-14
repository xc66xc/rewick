package com.interview.copilot.service.payment;

import java.util.List;
import java.util.Map;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description ZPAY 独立支付渠道处理。
 */
public interface ZpayNotificationService {
    void notify(Map<String, List<String>> parameters);
}
