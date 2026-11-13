package com.interview.copilot.exception.questions;

/** Bounded internal diagnostics only; never contains model output or user text. */
public enum QuestionRewriteValidationRule {
    RESPONSE_FORMAT("response_format"),
    TRUNCATED("truncated"),
    JSON("json"),
    EXTRACTION_STRUCTURE("extraction_structure");

    private final String code;

    QuestionRewriteValidationRule(String code) { this.code = code; }

    public String code() { return code; }
}
