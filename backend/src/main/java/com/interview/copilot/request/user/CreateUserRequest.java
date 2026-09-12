package com.interview.copilot.request.user;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateUserRequest(
        @NotBlank @Pattern(regexp = "[A-Za-z0-9_.@-]{3,64}") String identifier,
        @NotBlank @Size(max = 72) String password,
        @NotNull @Min(0) @Max(315360000) Long availableSeconds) {
    @Override
    public String toString() {
        return "CreateUserRequest[password=redacted]";
    }
}
