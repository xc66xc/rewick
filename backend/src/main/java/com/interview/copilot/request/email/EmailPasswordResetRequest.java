package com.interview.copilot.request.email;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 邮箱验证码重置密码请求。
 */
public record EmailPasswordResetRequest(
        @NotBlank @Size(max = 254) String email,
        @NotBlank @Size(max = 72) String password,
        @NotBlank @Pattern(regexp = "[0-9]{6}") String code) {
    @Override
    public String toString() {
        return "EmailPasswordResetRequest[password=redacted, code=redacted]";
    }
}
