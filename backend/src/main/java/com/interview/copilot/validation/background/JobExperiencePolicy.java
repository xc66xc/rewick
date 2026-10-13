package com.interview.copilot.validation.background;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.NullNode;

import java.util.Set;

/** Validates target-job requirements; never represents a candidate's actual tenure. */
public final class JobExperiencePolicy {
    public static final String FIELD = "jobExperienceLevel";
    private static final Set<String> LEVELS = Set.of(
            "no_experience", "one_to_three_years", "three_to_five_years", "five_plus_years");

    private JobExperiencePolicy() {}

    public static boolean isValid(JsonNode value) {
        return value == null || value.isMissingNode() || value.isNull()
                || value.isTextual() && LEVELS.contains(value.asText());
    }

    public static void validate(JsonNode value) {
        if (!isValid(value)) throw BackgroundPolicy.invalid("请选择有效的岗位经验要求。");
    }

    public static JsonNode value(JsonNode environment) {
        JsonNode value = environment.get(FIELD);
        return value == null ? NullNode.instance : value;
    }
}
