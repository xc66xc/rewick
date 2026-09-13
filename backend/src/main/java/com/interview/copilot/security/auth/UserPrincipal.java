package com.interview.copilot.security.auth;

import java.security.Principal;

public record UserPrincipal(
        long id, String displayName, String role, String email, long tokenId, String clientType)
        implements Principal {
    public UserPrincipal(long id, String displayName, String role, String email) {
        this(id, displayName, role, email, 0, "desktop");
    }

    public UserPrincipal(long id, String displayName, String role) {
        this(id, displayName, role, null);
    }

    public UserPrincipal(long id, String displayName) {
        this(id, displayName, "USER");
    }

    @Override
    public String getName() {
        return displayName;
    }
}
