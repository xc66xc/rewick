package com.interview.copilot.validation.history;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.validation.background.BackgroundPolicy;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SessionRecordInterviewTypeTest {
    private final ObjectMapper json = new ObjectMapper();

    private ObjectNode record() {
        var record = json.createObjectNode().put("id", "record").put("title", "面试")
                .put("createdAt", "2026-10-16T10:00:00+08:00");
        record.putArray("segments");
        record.putArray("answers").addObject().put("id", "answer").put("question", "问题")
                .put("text", "回答").put("status", "complete")
                .put("createdAt", "2026-10-16T10:00:00+08:00");
        return record;
    }

    @ParameterizedTest
    @ValueSource(strings = {"technical", "general", "hr"})
    void validate_knownType_acceptsPreparationAndSnapshots(String type) {
        var record = record();
        record.putObject("interviewEnvironment").put("interviewType", type);
        ((ObjectNode) record.path("answers").get(0))
                .putObject("interviewEnvironment").put("interviewType", type);
        assertThatCode(() -> BackgroundPolicy.interviewType(json.getNodeFactory().textNode(type)))
                .doesNotThrowAnyException();
        assertThatCode(() -> SessionRecordPolicy.validate("record", record)).doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {"\"HR\"", "\"\"", "null", "true", "3", "{}", "[]"})
    void validate_invalidType_rejectsBothSnapshotLocations(String value) throws Exception {
        var type = json.readTree(value);
        assertThatThrownBy(() -> BackgroundPolicy.interviewType(type)).isInstanceOf(ApiException.class);
        var record = record();
        record.putObject("interviewEnvironment").set("interviewType", type);
        assertThatThrownBy(() -> SessionRecordPolicy.validate("record", record)).isInstanceOf(ApiException.class);
        record.remove("interviewEnvironment");
        ((ObjectNode) record.path("answers").get(0)).putObject("interviewEnvironment").set("interviewType", type);
        assertThatThrownBy(() -> SessionRecordPolicy.validate("record", record)).isInstanceOf(ApiException.class);
    }

    @org.junit.jupiter.api.Test
    void validate_legacyMissingType_acceptsHistoryButNotNewPreparation() {
        assertThatCode(() -> SessionRecordPolicy.validate("record", record())).doesNotThrowAnyException();
        assertThatThrownBy(() -> BackgroundPolicy.interviewType(json.missingNode())).isInstanceOf(ApiException.class);
    }
}
