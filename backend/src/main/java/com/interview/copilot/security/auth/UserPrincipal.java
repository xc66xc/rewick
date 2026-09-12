package com.interview.copilot.security.auth;

import java.security.Principal;

public record UserPrincipal(long id, String displayName, String role, String email)
        implements Principal {
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
