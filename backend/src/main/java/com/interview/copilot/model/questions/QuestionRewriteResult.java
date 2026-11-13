package com.interview.copilot.model.questions;

import java.util.Map;
import java.util.List;
import com.interview.copilot.dto.questions.ExtractedQuestion;

public record QuestionRewriteResult(String action, String question, Map<String, Object> usage,
        List<ExtractedQuestion> questions) {
    public QuestionRewriteResult(String action, String question, Map<String, Object> usage) {
        this(action, question, usage, List.of());
    }

    public QuestionRewriteResult {
        usage = Map.copyOf(usage);
        questions = List.copyOf(questions);
    }
}
