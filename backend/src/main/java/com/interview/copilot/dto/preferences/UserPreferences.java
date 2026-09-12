package com.interview.copilot.dto.preferences;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record UserPreferences(
        @NotNull @Pattern(regexp = "concise|detailed") String answerStyle,
        @NotNull @DecimalMin("0") @DecimalMax("2") Double temperature,
        @NotNull @Min(200) @Max(6000) Integer silenceMs,
        @NotNull @Valid AutoAnswer autoAnswer,
        @NotNull Boolean retrievalEnabled,
        @NotNull Boolean remoteKnowledgeEnabled,
        @NotNull @Valid PlatformSelections platformSelections) {
    public record AutoAnswer(
            @NotNull Boolean enabled, @NotNull @Min(1000) @Max(5000) Integer pauseMs) {}

    public record PlatformSelections(
            @Size(min = 1, max = 200) String llm,
            @Size(min = 1, max = 200) String asr,
            @Size(min = 1, max = 200) String knowledge) {}
}
