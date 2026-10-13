package com.interview.copilot.validation.history;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.exception.ApiException;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SessionRecordExperienceTest {
    private final ObjectMapper json = new ObjectMapper();
    private ObjectNode record(String value, boolean answer) throws Exception {
        var record = (ObjectNode) json.readTree("{\"id\":\"record\",\"title\":\"面试\",\"createdAt\":\"2026-10-13T10:00:00+08:00\",\"segments\":[],\"answers\":[]}");
        ObjectNode holder = record;
        if (answer) {
            holder = (ObjectNode) json.readTree("{\"id\":\"answer\",\"question\":\"问题\",\"text\":\"回答\",\"status\":\"complete\",\"createdAt\":\"2026-10-13T10:00:00+08:00\"}");
            record.withArray("answers").add(holder);
        }
        var environment = holder.putObject("interviewEnvironment").put("interviewType", "technical");
        if (!"omitted".equals(value)) environment.set("jobExperienceLevel", json.readTree(value));
        return record;
    }
    @ParameterizedTest
    @ValueSource(strings = {"omitted", "null", "\"no_experience\"", "\"one_to_three_years\"", "\"three_to_five_years\"", "\"five_plus_years\""})
    void validate_sessionAndAnswerKnownOrLegacy_accepts(String value) throws Exception {
        var session = record(value, false); var answer = record(value, true);
        assertThatCode(() -> SessionRecordPolicy.validate("record", session)).doesNotThrowAnyException();
        assertThatCode(() -> SessionRecordPolicy.validate("record", answer)).doesNotThrowAnyException();
    }
    @ParameterizedTest
    @ValueSource(strings = {"\"\"", "\"senior\"", "3", "true", "{}", "[]"})
    void validate_sessionAndAnswerInvalid_rejects(String value) throws Exception {
        var session = record(value, false); var answer = record(value, true);
        assertThatThrownBy(() -> SessionRecordPolicy.validate("record", session)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> SessionRecordPolicy.validate("record", answer)).isInstanceOf(ApiException.class);
    }
}
