package com.interview.copilot.converter.history;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class SessionRecordProjectionTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void project_legacyReader_omitsOnlyUnsupportedAuxiliaryFieldsWithoutMutatingOriginal() throws Exception {
        var input = json.readTree("""
                {"answers":[{"question":"本次原话","text":"完整回答","modelInput":{"messages":["真实发送列表"]},
                  "questionRewrite":{"resultFormat":"questions-v1","questions":[{"id":"q1"}]},
                  "retrieval":{"queries":[{"questionId":"q1"}],"excerpts":[{"excerptId":"e1","questionIds":["q1"],
                  "documentId":"real-document","chunkId":"real-context","text":"真实来源"}]}}]}
                """);

        var result = SessionRecordProjection.project(input, null);
        var answer = result.path("answers").path(0);
        assertThat(answer.has("questionRewrite")).isFalse();
        assertThat(answer.path("retrieval").has("queries")).isFalse();
        assertThat(answer.path("retrieval").path("excerpts").path(0).has("questionIds")).isFalse();
        assertThat(answer.path("retrieval").path("excerpts").path(0).path("text").asText()).isEqualTo("真实来源");
        assertThat(answer.path("modelInput")).isEqualTo(input.path("answers").path(0).path("modelInput"));
        assertThat(answer.path("question").asText()).isEqualTo("本次原话");
        assertThat(input.path("answers").path(0).has("questionRewrite")).isTrue();
    }

    @Test
    void project_newReaderOrOldRecord_keepsOriginalEvidence() throws Exception {
        var input = json.readTree("{\"answers\":[{\"questionRewrite\":{\"question\":\"旧整理\",\"status\":\"rewritten\"}}]}");
        assertThat(SessionRecordProjection.project(input, "questions-v1")).isEqualTo(input);
        assertThat(SessionRecordProjection.project(input, null)).isEqualTo(input);
    }
}
