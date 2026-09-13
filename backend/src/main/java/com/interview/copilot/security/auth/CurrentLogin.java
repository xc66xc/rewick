package com.interview.copilot.security.auth;

import org.springframework.security.core.context.SecurityContextHolder;

/** Request identity only; background jobs have no request identity. */
public final class CurrentLogin {
    private CurrentLogin() {}

    public static UserPrincipal principal() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null && authentication.getPrincipal() instanceof UserPrincipal p
                ? p
                : null;
    }

    public static Long tokenId() {
        var p = principal();
        return p == null || p.tokenId() == 0 ? null : p.tokenId();
    }
}
