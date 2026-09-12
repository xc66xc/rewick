package com.interview.copilot.dto.usage;

public record UsageFilter(Long userId, String capability, String status, String model, String query) {}
