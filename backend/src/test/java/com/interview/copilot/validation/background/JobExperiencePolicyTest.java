package com.interview.copilot.validation.background;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.MissingNode;
import com.interview.copilot.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JobExperiencePolicyTest {
    private final ObjectMapper json = new ObjectMapper();

    @ParameterizedTest
    @ValueSource(strings = {"\"no_experience\"", "\"one_to_three_years\"", "\"three_to_five_years\"", "\"five_plus_years\"", "null"})
    void validate_knownRequirement_accepts(String value) throws Exception {
        var node = json.readTree(value);
        assertThatCode(() -> JobExperiencePolicy.validate(node)).doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {"\"\"", "\"senior\"", "\"5\"", "\" no_experience \"", "5", "true", "{}", "[]"})
    void validate_unknownOrNonString_rejects(String value) throws Exception {
        var node = json.readTree(value);
        assertThatThrownBy(() -> JobExperiencePolicy.validate(node)).isInstanceOf(ApiException.class);
    }

    @Test
    void validate_omittedRequirement_accepts() {
        assertThatCode(() -> JobExperiencePolicy.validate(MissingNode.getInstance())).doesNotThrowAnyException();
        assertThatCode(() -> JobExperiencePolicy.validate(null)).doesNotThrowAnyException();
    }
}
