package com.interview.copilot.exception.questions;

import java.util.Map;

/** Fixed diagnostic only; model output and private question text are never exception messages. */
public final class QuestionRewriteOutputException extends QuestionRewriteFailure {
    private final QuestionRewriteValidationRule rule;

    public QuestionRewriteOutputException() {
        this(QuestionRewriteValidationRule.EXTRACTION_STRUCTURE, Map.of());
    }

    public QuestionRewriteOutputException(Map<String, Object> usage) {
        this(QuestionRewriteValidationRule.EXTRACTION_STRUCTURE, usage);
    }

    public QuestionRewriteOutputException(QuestionRewriteValidationRule rule) {
        this(rule, Map.of());
    }

    public QuestionRewriteOutputException(QuestionRewriteValidationRule rule,
            Map<String, Object> usage) {
        super("invalid_output", usage, "Question rewrite returned invalid or unsafe output");
        this.rule = java.util.Objects.requireNonNull(rule);
    }

    public QuestionRewriteValidationRule rule() { return rule; }
}
