package com.interview.copilot.exception.questions;

import java.util.Map;

/** Carries only fixed classifications and validated token counters, never supplier text. */
public class QuestionRewriteFailure extends RuntimeException {
    private final String reason;
    private final Map<String, Object> usage;

    public QuestionRewriteFailure(String reason, Map<String, Object> usage) {
        this(reason, usage, "Question rewrite request failed");
    }

    protected QuestionRewriteFailure(String reason, Map<String, Object> usage, String message) {
        super(message);
        this.reason = reason;
        this.usage = Map.copyOf(usage);
    }

    public String reason() {
        return reason;
    }

    public Map<String, Object> usage() {
        return usage;
    }
}
