package com.interview.copilot.controller.payment;

import com.interview.copilot.service.payment.ZpayNotificationService;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description ZPAY 独立支付渠道处理。
 */
@RestController
public class ZpayNotificationController {
    private final ZpayNotificationService notifications;

    public ZpayNotificationController(ZpayNotificationService notifications) {
        this.notifications = notifications;
    }

    @GetMapping(value = "/api/v1/payments/zpay/notify", produces = "text/plain")
    public String notify(@RequestParam MultiValueMap<String, String> parameters) {
        notifications.notify(parameters);
        return "success";
    }
}
