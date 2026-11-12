package com.interview.copilot.model.questions;

import java.util.Map;

public record QuestionRewriteResult(String action, String question, Map<String, Object> usage) {
    public QuestionRewriteResult {
        usage = Map.copyOf(usage);
    }
}
