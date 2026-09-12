package com.interview.copilot.entity.email;

public record StoredEmailConfiguration(
        long version,
        boolean enabled,
        String host,
        int port,
        String username,
        String encryptedPassword,
        String fromAddress,
        boolean startTls,
        boolean ssl) {
    @Override
    public String toString() {
        return "StoredEmailConfiguration[version=" + version + "]";
    }
}
