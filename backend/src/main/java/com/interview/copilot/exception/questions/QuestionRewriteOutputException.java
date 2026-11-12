package com.interview.copilot.exception.questions;

import java.util.Map;

/** Fixed diagnostic only; model output and private question text are never exception messages. */
public final class QuestionRewriteOutputException extends QuestionRewriteFailure {
    public QuestionRewriteOutputException() {
        this(Map.of());
    }

    public QuestionRewriteOutputException(Map<String, Object> usage) {
        super("invalid_output", usage, "Question rewrite returned invalid or unsafe output");
    }
}
