package com.interview.copilot.controller.payment;

import com.interview.copilot.converter.payment.AlipayFormConverter;
import com.interview.copilot.service.payment.AlipayNotificationService;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.InputStream;

@RestController
public class AlipayNotificationController {
    private final AlipayNotificationService notifications;

    public AlipayNotificationController(AlipayNotificationService notifications) {
        this.notifications = notifications;
    }

    @PostMapping(
            value = "/api/v1/payments/alipay/notify",
            consumes = "application/x-www-form-urlencoded",
            produces = "text/plain")
    public String notify(InputStream body) throws IOException {
        // Read the bounded filter's cached stream; servlet form parameters were not populated
        // because HttpBodyLimitFilter consumed the original stream before MVC processing.
        notifications.notify(AlipayFormConverter.parameters(body));
        return "success";
    }
}
