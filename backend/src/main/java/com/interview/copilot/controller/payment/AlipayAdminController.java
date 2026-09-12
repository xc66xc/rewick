package com.interview.copilot.controller.payment;

import com.interview.copilot.converter.payment.PaymentInputConverter;
import com.interview.copilot.request.payment.AlipayConfigRequest;
import com.interview.copilot.response.payment.AlipayConfigResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.payment.AlipayConfigService;

import jakarta.validation.Valid;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/payment-config/alipay")
public class AlipayAdminController {
    private final AlipayConfigService configs;

    public AlipayAdminController(AlipayConfigService configs) {
        this.configs = configs;
    }

    @GetMapping
    public AlipayConfigResponse read() {
        return configs.read();
    }

    @PutMapping
    public AlipayConfigResponse save(
            @AuthenticationPrincipal UserPrincipal actor,
            @Valid @RequestBody AlipayConfigRequest p) {
        return configs.save(actor.id(), PaymentInputConverter.alipayConfigDTO(p));
    }
}
