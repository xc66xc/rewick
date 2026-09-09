package com.interview.copilot.auth;

import java.security.Principal;
import org.apache.ibatis.annotations.AutomapConstructor;

public record UserPrincipal(long id, String username, String role, String email) implements Principal {
    @AutomapConstructor
    public UserPrincipal(long id, String username, String role, String email) {
        this.id = id;
        this.username = username;
        this.role = role;
        this.email = email;
    }

    public UserPrincipal(long id, String username, String role) { this(id, username, role, null); }
    public UserPrincipal(long id, String username) { this(id, username, "USER"); }

    @Override
    public String getName() { return username; }
}
