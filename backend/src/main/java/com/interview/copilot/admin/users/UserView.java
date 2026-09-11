package com.interview.copilot.admin.users;

import java.time.Instant;

public record UserView(String id, String displayName, String role, boolean enabled,
        long availableSeconds, long walletVersion, Instant createdAt) {}
