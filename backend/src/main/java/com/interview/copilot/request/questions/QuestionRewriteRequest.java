package com.interview.copilot.request.questions;

import java.util.List;

public record QuestionRewriteRequest(String question, List<String> context, String resultFormat) {
    public QuestionRewriteRequest(String question, List<String> context) {
        this(question, context, null);
    }

    @com.fasterxml.jackson.annotation.JsonIgnore
    public boolean isQuestionsFormat() {
        return "questions-v1".equals(resultFormat);
    }
}
