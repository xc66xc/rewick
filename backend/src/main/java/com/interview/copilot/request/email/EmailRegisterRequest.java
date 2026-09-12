package com.interview.copilot.request.email;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record EmailRegisterRequest(
        @NotBlank @Size(max = 254) String email,
        @NotBlank @Size(max = 72) String password,
        @NotBlank @Pattern(regexp = "[0-9]{6}") String code) {
    @Override
    public String toString() {
        return "EmailRegisterRequest[password=redacted, code=redacted]";
    }
}
