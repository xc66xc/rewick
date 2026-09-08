package com.interview.copilot.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("copilot.auth.admin")
public record AdminBootstrapProperties(String bootstrapUsername, String bootstrapPassword) {
    public AdminBootstrapProperties {
        bootstrapUsername = bootstrapUsername == null ? "" : bootstrapUsername;
        bootstrapPassword = bootstrapPassword == null ? "" : bootstrapPassword;
    }

    @Override
    public String toString() { return "AdminBootstrapProperties[credentials=redacted]"; }
}
