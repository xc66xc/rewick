package com.interview.copilot.service.questions;

public interface QuestionRewriteAccessService {
    String require(long user, long token);
    void requireActive(long user, long token, String sessionId);
}
