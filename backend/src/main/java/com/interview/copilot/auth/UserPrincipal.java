package com.interview.copilot.auth;

import java.security.Principal;

public record UserPrincipal(long id, String username) implements Principal {
    @Override
    public String getName() { return username; }
}
