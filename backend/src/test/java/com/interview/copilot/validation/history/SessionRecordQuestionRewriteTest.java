package com.interview.copilot.validation.history;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.exception.ApiException;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SessionRecordQuestionRewriteTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void validateStructure_optionalRewriteSnapshot_preservesOriginalQuestion() throws Exception {
        var session = session();
        var answer = (ObjectNode) session.path("answers").path(0);
        answer.set("questionRewrite", json.readTree("{\"status\":\"rewritten\",\"question\":\"整理问题\",\"reason\":null,\"model\":\"synthetic\",\"durationMs\":700,\"platformVersion\":8}"));
        assertThatCode(() -> SessionRecordPolicy.validateStructure("session", session)).doesNotThrowAnyException();
    }

    @Test
    void validateStructure_degradedWithClaimedQuestion_rejectsInvalidSnapshot() throws Exception {
        var session = session();
        var answer = (ObjectNode) session.path("answers").path(0);
        answer.set("questionRewrite", json.readTree("{\"status\":\"degraded\",\"question\":\"伪造整理\",\"reason\":\"timeout\",\"model\":null,\"durationMs\":1500,\"platformVersion\":8}"));
        assertThatThrownBy(() -> SessionRecordPolicy.validateStructure("session", session)).isInstanceOf(ApiException.class);
    }

    private ObjectNode session() throws Exception {
        return (ObjectNode) json.readTree("{\"id\":\"session\",\"title\":\"会话\",\"createdAt\":\"2026-11-12T12:00:00+08:00\",\"segments\":[],\"answers\":[{\"id\":\"answer\",\"question\":\"原问题\",\"text\":\"回答\",\"status\":\"complete\",\"createdAt\":\"2026-11-12T12:00:00+08:00\"}]}");
    }
}
