package com.interview.copilot.service.usage;

import com.interview.copilot.common.usage.UsageLease;

public interface UsageService {
    UsageLease start(long userId, String requestId, String capability);

    void finish(long userId, String requestId, String capability, String status);

    void describeModel(long userId, String requestId, String capability, String model);

    boolean active(long userId, String sessionId);
}
