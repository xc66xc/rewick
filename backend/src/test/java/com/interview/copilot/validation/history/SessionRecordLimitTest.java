package com.interview.copilot.validation.history;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.exception.ApiException;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;

class SessionRecordLimitTest {
    private ObjectNode record(int bytes) {
        var record = new ObjectMapper().createObjectNode().put("id", "record").put("title", "record")
                .put("createdAt", "2026-11-06T10:00:00+08:00");
        record.putArray("segments");
        var input = record.putArray("answers").addObject().put("id", "answer")
                .put("question", "question").put("text", "answer").put("status", "complete")
                .put("createdAt", "2026-11-06T10:00:00+08:00").putObject("modelInput");
        input.put("content", "");
        input.put("content", "x".repeat(bytes - record.toString().length()));
        return record;
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 20, 50})
    void validate_configuredBoundary_acceptsExactBytesAndRejectsNextByte(int maxMiB) {
        var record = record(maxMiB * 1048576);
        assertThatCode(() -> SessionRecordPolicy.validate("record", record, maxMiB)).doesNotThrowAnyException();
        ((ObjectNode) record.path("answers").get(0).path("modelInput"))
                .put("content", record.path("answers").get(0).path("modelInput").path("content").asText() + "x");
        assertThatThrownBy(() -> SessionRecordPolicy.validate("record", record, maxMiB))
                .isInstanceOfSatisfying(ApiException.class, error -> {
                    assertThat(error.code()).isEqualTo("SESSION_RECORD_TOO_LARGE");
                    assertThat(error.getMessage()).contains(maxMiB + " MiB");
                });
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 51})
    void validate_invalidConfiguredLimit_reportsConfigurationUnavailable(int maxMiB) {
        assertThatThrownBy(() -> SessionRecordPolicy.validate("record", record(1024), maxMiB))
                .isInstanceOfSatisfying(ApiException.class,
                        error -> assertThat(error.code()).isEqualTo("SESSION_RECORD_LIMIT_UNAVAILABLE"));
    }
}
