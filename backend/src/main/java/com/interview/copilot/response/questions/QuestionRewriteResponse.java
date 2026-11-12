package com.interview.copilot.response.questions;

public record QuestionRewriteResponse(String status, String question, String reason, String model,
        double durationMs, long platformVersion) {}
