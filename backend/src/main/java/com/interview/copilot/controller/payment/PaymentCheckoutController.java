package com.interview.copilot.controller.payment;

import com.interview.copilot.converter.payment.AlipayFormConverter;
import com.interview.copilot.exception.payment.PaymentErrors;
import com.interview.copilot.response.payment.PaymentCheckoutResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.payment.PaymentCheckoutService;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.InputStream;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 浏览器支付收银台处理。
 */
@RestController
public class PaymentCheckoutController {
    private final PaymentCheckoutService checkout;

    public PaymentCheckoutController(PaymentCheckoutService checkout) {
        this.checkout = checkout;
    }

    @PostMapping("/api/v1/payment-orders/{id}/checkout")
    public PaymentCheckoutResponse issue(
            @AuthenticationPrincipal UserPrincipal user, @PathVariable String id) {
        return checkout.issue(user.id(), id);
    }

    @GetMapping({"/api/v1/payments/alipay/checkout", "/api/v1/payments/zpay/checkout"})
    public ResponseEntity<String> confirm(@RequestParam String ticket) {
        return html(checkout.confirm(ticket));
    }

    @PostMapping(
            value = {"/api/v1/payments/alipay/checkout", "/api/v1/payments/zpay/checkout"},
            consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public ResponseEntity<String> submit(InputStream body) throws IOException {
        var values = AlipayFormConverter.parameters(body).get("ticket");
        if (values == null || values.size() != 1) throw PaymentErrors.invalid("付款入口参数无效");
        return html(checkout.submit(values.get(0)));
    }

    private ResponseEntity<String> html(String body) {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/html;charset=UTF-8"))
                .header("Cache-Control", "no-store")
                .header("Referrer-Policy", "no-referrer")
                .header(
                        "Content-Security-Policy",
                        "default-src 'none'; script-src 'sha256-"
                                + submitScriptHash()
                                + "'; form-action 'self' https://openapi.alipay.com"
                                + " https://openapi-sandbox.dl.alipaydev.com https://zpayz.cn https://z-pay.cn; base-uri 'none';"
                                + " frame-ancestors 'none'")
                .body(body);
    }

    private String submitScriptHash() {
        // SDK uses this fixed script to submit its generated POST form.
        return "8lDeP0UDwCO6/RhblgeH/ctdBzjVpJxrXizsnIk3cEQ=";
    }
}
