package com.interview.copilot.auth;

import java.security.Principal;
import org.apache.ibatis.annotations.AutomapConstructor;

public record UserPrincipal(long id, String username, String role) implements Principal {
    @AutomapConstructor
    public UserPrincipal(long id, String username, String role) {
        this.id = id;
        this.username = username;
        this.role = role;
    }

    public UserPrincipal(long id, String username) { this(id, username, "USER"); }

    @Override
    public String getName() { return username; }
}
