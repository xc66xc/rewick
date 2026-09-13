package com.interview.copilot.service.auth;

public interface SessionGuardService {
    Long lockUser(long userId);

    void requireSession(long userId, long tokenId);
}
