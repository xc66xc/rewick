package com.interview.copilot.exception.payment;

import com.interview.copilot.exception.ApiException;

import org.springframework.http.HttpStatus;

public final class PaymentErrors {
    private PaymentErrors() {}

    public static ApiException invalid(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "PAYMENT_INVALID", message);
    }

    public static ApiException conflict(String code, String message) {
        return new ApiException(HttpStatus.CONFLICT, code, message);
    }

    public static ApiException unavailable() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "PAYMENT_UNAVAILABLE", "支付暂未开放");
    }

    public static ApiException upstream() {
        return new ApiException(HttpStatus.BAD_GATEWAY, "PAYMENT_UPSTREAM", "支付服务暂时不可用，请稍后查看订单状态");
    }

    public static ApiException missing() {
        return new ApiException(HttpStatus.NOT_FOUND, "PAYMENT_NOT_FOUND", "订单或套餐不存在");
    }
}
