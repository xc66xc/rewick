package com.interview.copilot.security.auth;

import org.apache.ibatis.annotations.AutomapConstructor;

import java.security.Principal;

public record UserPrincipal(long id, String displayName, String role, String email)
        implements Principal {
    @AutomapConstructor
    public UserPrincipal(long id, String displayName, String role, String email) {
        this.id = id;
        this.displayName = displayName;
        this.role = role;
        this.email = email;
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
