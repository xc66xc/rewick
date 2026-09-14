package com.interview.copilot.controller.payment;

import com.interview.copilot.converter.payment.ZpayConfigConverter;
import com.interview.copilot.request.payment.ZpayConfigRequest;
import com.interview.copilot.response.payment.ZpayConfigResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.payment.ZpayConfigService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description ZPAY 支付配置
 */
@RestController
@RequestMapping("/api/v1/admin/payment-config/zpay")
public class AdminZpayConfigController {
    private final ZpayConfigService configs;

    public AdminZpayConfigController(ZpayConfigService configs) {
        this.configs = configs;
    }

    @GetMapping
    public ZpayConfigResponse read() {
        return configs.read();
    }

    @PutMapping
    public ZpayConfigResponse save(@AuthenticationPrincipal UserPrincipal actor,
            @Valid @RequestBody ZpayConfigRequest input) {
        return configs.save(actor.id(), ZpayConfigConverter.input(input));
    }
}

