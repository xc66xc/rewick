package com.interview.copilot.auth;

import java.nio.charset.StandardCharsets;

public final class PasswordRules {
    private PasswordRules() {}

    public static boolean isValid(String password) {
        return password != null && !password.isBlank() && password.length() >= 12
                && password.getBytes(StandardCharsets.UTF_8).length <= 72;
    }
}
