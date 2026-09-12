package com.interview.copilot.controller.payment;

import com.interview.copilot.converter.payment.PaymentInputConverter;
import com.interview.copilot.request.payment.ManualRefundRequest;
import com.interview.copilot.request.payment.PackageRequest;
import com.interview.copilot.request.payment.PaymentConfigRequest;
import com.interview.copilot.response.payment.PaymentConfigResponse;
import com.interview.copilot.response.payment.PaymentOrderResponse;
import com.interview.copilot.response.payment.TimePackageResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.payment.PackageService;
import com.interview.copilot.service.payment.PaymentConfigService;
import com.interview.copilot.service.payment.PaymentOrderService;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/admin")
public class PaymentAdminController {
    private final PackageService packages;
    private final PaymentConfigService configs;
    private final PaymentOrderService orders;

    public PaymentAdminController(
            PackageService packages, PaymentConfigService configs, PaymentOrderService orders) {
        this.packages = packages;
        this.configs = configs;
        this.orders = orders;
    }

    @GetMapping("/packages")
    public List<TimePackageResponse> packages() {
        return packages.list();
    }

    @PostMapping("/packages")
    public TimePackageResponse create(
            @AuthenticationPrincipal UserPrincipal actor, @Valid @RequestBody PackageRequest p) {
        return packages.save(actor.id(), null, PaymentInputConverter.packageDTO(p));
    }

    @PutMapping("/packages/{id}")
    public TimePackageResponse update(
            @AuthenticationPrincipal UserPrincipal actor,
            @PathVariable long id,
            @Valid @RequestBody PackageRequest p) {
        return packages.save(actor.id(), id, PaymentInputConverter.packageDTO(p));
    }

    @DeleteMapping("/packages/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void archive(@AuthenticationPrincipal UserPrincipal actor, @PathVariable long id) {
        packages.archive(actor.id(), id);
    }

    @GetMapping("/payment-config")
    public PaymentConfigResponse config() {
        return configs.read();
    }

    @PutMapping("/payment-config")
    public PaymentConfigResponse saveConfig(
            @AuthenticationPrincipal UserPrincipal actor,
            @Valid @RequestBody PaymentConfigRequest p) {
        return configs.save(actor.id(), PaymentInputConverter.configDTO(p));
    }

    @GetMapping("/payment-orders")
    public List<PaymentOrderResponse> orders() {
        return orders.list(null);
    }

    @PostMapping("/payment-orders/{id}/refresh")
    public PaymentOrderResponse refresh(@PathVariable String id) {
        return orders.refresh(null, id);
    }

    @PostMapping("/payment-orders/{id}/refund")
    public PaymentOrderResponse refund(
            @AuthenticationPrincipal UserPrincipal actor,
            @PathVariable String id,
            @Valid @RequestBody ManualRefundRequest p) {
        return orders.refund(actor.id(), id, PaymentInputConverter.refundDTO(p));
    }
}
