package com.interview.copilot.auth.email;

import com.interview.copilot.common.ApiException;
import org.springframework.http.HttpStatus;

final class EmailErrors {
    private EmailErrors() {}
    static ApiException unavailable() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "email_unavailable", "邮箱注册服务暂不可用，请稍后重试。");
    }
    static ApiException limited() {
        return new ApiException(HttpStatus.TOO_MANY_REQUESTS, "email_rate_limited", "操作过于频繁，请稍后再试。");
    }
    static ApiException registered() {
        return new ApiException(HttpStatus.CONFLICT, "email_registered", "该邮箱已注册，如果该邮箱为您的邮箱，可以直接登录或找回密码");
    }
    static ApiException notRegistered() {
        return new ApiException(HttpStatus.NOT_FOUND, "email_not_registered", "该邮箱尚未注册，请先注册账号。");
    }
    static final class InvalidCode extends ApiException {
        InvalidCode() { super(HttpStatus.BAD_REQUEST, "invalid_email_code", "验证码无效、已过期或尝试次数过多，请重新获取。"); }
    }
}
