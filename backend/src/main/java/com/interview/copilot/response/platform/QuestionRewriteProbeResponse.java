package com.interview.copilot.response.platform;

public record QuestionRewriteProbeResponse(String originalQuestion, String status,
        String question, String model) {}
