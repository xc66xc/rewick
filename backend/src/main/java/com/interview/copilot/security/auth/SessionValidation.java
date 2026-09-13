package com.interview.copilot.security.auth;

import com.interview.copilot.entity.auth.AuthenticatedUserEntity;
import com.interview.copilot.exception.ApiException;

import org.springframework.http.HttpStatus;

import java.time.LocalDateTime;

public final class SessionValidation {
    private SessionValidation() {}

    public static void require(AuthenticatedUserEntity row, LocalDateTime now) {
        if (row == null) throw expired();
        if (!row.enabled())
            throw new ApiException(HttpStatus.UNAUTHORIZED, "account_disabled", "账号已禁用，请联系管理员。");
        if (row.revoked()) {
            if ("session_replaced".equals(row.revokedReason())) throw replaced();
            throw expired();
        }
        if (!row.expiresAt().isAfter(now)) throw expired();
    }

    public static ApiException expired() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "session_expired", "登录已失效，请重新登录。");
    }

    public static ApiException replaced() {
        return new ApiException(
                HttpStatus.UNAUTHORIZED, "session_replaced", "你的账号已在其他设备登录，本机已退出。进行中的面试已结束，时长已结算。");
    }
}
