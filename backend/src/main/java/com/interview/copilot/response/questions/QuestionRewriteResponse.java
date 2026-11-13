package com.interview.copilot.response.questions;

import com.fasterxml.jackson.annotation.JsonValue;
import com.interview.copilot.dto.questions.ExtractedQuestion;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public record QuestionRewriteResponse(String status, String question, String reason, String model,
        double durationMs, long platformVersion, String resultFormat, List<ExtractedQuestion> questions) {
    public QuestionRewriteResponse(String status, String question, String reason, String model,
            double durationMs, long platformVersion) {
        this(status, question, reason, model, durationMs, platformVersion, null, List.of());
    }

    @JsonValue
    public Map<String, Object> wire() {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("status", status);
        if ("questions-v1".equals(resultFormat)) {
            value.put("resultFormat", resultFormat);
            value.put("questions", questions);
        } else value.put("question", question);
        value.put("reason", reason);
        value.put("model", model);
        value.put("durationMs", durationMs);
        value.put("platformVersion", platformVersion);
        return value;
    }
}
