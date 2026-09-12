package com.interview.copilot.controller.payment;

import com.interview.copilot.dto.payment.PaymentHeadersDTO;
import com.interview.copilot.request.payment.CreatePaymentOrderRequest;
import com.interview.copilot.response.payment.PackageCatalogResponse;
import com.interview.copilot.response.payment.PaymentOrderResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.payment.PackageService;
import com.interview.copilot.service.payment.PaymentOrderService;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1")
public class PaymentController {
    private final PackageService packages;
    private final PaymentOrderService orders;

    public PaymentController(PackageService packages, PaymentOrderService orders) {
        this.packages = packages;
        this.orders = orders;
    }

    @GetMapping("/packages")
    public PackageCatalogResponse catalog() {
        return packages.catalog();
    }

    @PostMapping("/payment-orders")
    public PaymentOrderResponse create(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody CreatePaymentOrderRequest p) {
        return orders.create(
                user.id(), p.packageId(), p.packageVersion(), p.requestId().toString());
    }

    @GetMapping("/payment-orders")
    public List<PaymentOrderResponse> list(@AuthenticationPrincipal UserPrincipal user) {
        return orders.list(user.id());
    }

    @GetMapping("/payment-orders/{id}")
    public PaymentOrderResponse read(
            @AuthenticationPrincipal UserPrincipal user, @PathVariable String id) {
        return orders.read(user.id(), id);
    }

    @PostMapping("/payment-orders/{id}/refresh")
    public PaymentOrderResponse refresh(
            @AuthenticationPrincipal UserPrincipal user, @PathVariable String id) {
        return orders.refresh(user.id(), id);
    }

    @PostMapping("/payments/wechat/notify")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void notify(
            @RequestBody String body,
            @RequestHeader(value = "Wechatpay-Serial", defaultValue = "") String serial,
            @RequestHeader(value = "Wechatpay-Nonce", defaultValue = "") String nonce,
            @RequestHeader(value = "Wechatpay-Timestamp", defaultValue = "") String timestamp,
            @RequestHeader(value = "Wechatpay-Signature", defaultValue = "") String signature) {
        orders.notify(body, new PaymentHeadersDTO(serial, nonce, timestamp, signature));
    }
}
