package com.interview.copilot.service.usage;

import com.interview.copilot.common.usage.UsageLease;

public interface UsageService {
    UsageLease start(long userId, String requestId, String capability);

    UsageLease startForSession(long userId, String requestId, String capability, long tokenId);

    void finish(long userId, String requestId, String capability, String status);

    void describeModel(long userId, String requestId, String capability, String model);

    boolean active(long userId, String sessionId);
}
