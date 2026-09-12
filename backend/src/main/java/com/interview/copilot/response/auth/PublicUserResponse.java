package com.interview.copilot.response.auth;

import com.fasterxml.jackson.annotation.JsonInclude;

public record PublicUserResponse(
        String id,
        String displayName,
        String role,
        @JsonInclude(JsonInclude.Include.NON_NULL) String email) {
    public PublicUserResponse(String id, String displayName, String role) {
        this(id, displayName, role, null);
    }

    public PublicUserResponse(String id, String displayName) {
        this(id, displayName, "USER");
    }
}
