package com.interview.copilot.request.email;

import com.fasterxml.jackson.annotation.JsonProperty;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record EmailConfigRequest(
        @Min(0) long version,
        boolean enabled,
        @NotNull @Size(max = 253) String host,
        @Min(1) @Max(65535) int port,
        @NotNull @Size(max = 254) String username,
        @JsonProperty(access = JsonProperty.Access.READ_ONLY) boolean hasPassword,
        @JsonProperty(access = JsonProperty.Access.WRITE_ONLY) @Size(max = 4096) String password,
        @NotNull @Size(max = 254) String from,
        boolean startTls,
        boolean ssl) {
    @Override
    public String toString() {
        return "EmailConfigRequest[redacted]";
    }
}
