package com.interview.copilot.entity.platform;

public record PlatformConfigRow(long version, boolean published, String payload) {
    @Override
    public String toString() {
        return "PlatformConfigRow[version=" + version + "]";
    }
}
