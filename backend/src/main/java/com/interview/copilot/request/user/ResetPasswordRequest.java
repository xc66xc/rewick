package com.interview.copilot.request.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ResetPasswordRequest(@NotBlank @Size(max = 72) String password) {
    @Override
    public String toString() {
        return "ResetPasswordRequest[password=redacted]";
    }
}
