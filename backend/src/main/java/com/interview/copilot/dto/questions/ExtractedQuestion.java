package com.interview.copilot.dto.questions;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

public record ExtractedQuestion(String id, String question, List<String> sourceTexts,
        @JsonInclude(JsonInclude.Include.NON_EMPTY) List<String> contextSourceTexts) {
    public ExtractedQuestion {
        sourceTexts = List.copyOf(sourceTexts);
        contextSourceTexts = List.copyOf(contextSourceTexts);
    }
}
