package com.interview.copilot.response.platform;

import com.fasterxml.jackson.annotation.JsonValue;
import com.interview.copilot.dto.questions.ExtractedQuestion;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public record QuestionRewriteProbeResponse(String originalQuestion, String status,
        String question, String model, String resultFormat, List<ExtractedQuestion> questions) {
    public QuestionRewriteProbeResponse(String originalQuestion, String status, String question, String model) {
        this(originalQuestion, status, question, model, null, List.of());
    }

    @JsonValue
    public Map<String, Object> wire() {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("originalQuestion", originalQuestion);
        value.put("status", status);
        value.put("model", model);
        if ("questions-v1".equals(resultFormat)) {
            value.put("resultFormat", resultFormat);
            value.put("questions", questions);
        } else value.put("question", question);
        return value;
    }
}
