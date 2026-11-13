package com.interview.copilot.validation.history;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.common.questions.SpokenExtractionFixture;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.request.questions.QuestionRewriteRequest;
import com.interview.copilot.validation.questions.QuestionExtractionPolicy;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;

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

    @Test
    void validateStructure_extractionAndActualEvidence_preservesPerQuestionAssociations() throws Exception {
        var session = extracted();
        assertThatCode(() -> SessionRecordPolicy.validateStructure("session", session)).doesNotThrowAnyException();
        assertThat(session.path("answers").path(0).path("question").asText()).isEqualTo("什么是 SSE？");
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 1, 2})
    void validateStructure_spokenExtractionWithNecessarySources_allowsRepeatedSync(int variant) throws Exception {
        var session = session();
        var answer = (ObjectNode) session.path("answers").path(0);
        answer.put("question", SpokenExtractionFixture.ORIGINAL);
        var questions = QuestionExtractionPolicy.output(json.valueToTree(SpokenExtractionFixture.output(variant)),
                new QuestionRewriteRequest(SpokenExtractionFixture.ORIGINAL, List.of(), "questions-v1"));
        var rewrite = answer.putObject("questionRewrite").put("resultFormat", "questions-v1").put("status", "rewritten")
                .put("model", "synthetic").put("durationMs", 700).put("platformVersion", 41);
        rewrite.putNull("reason");
        rewrite.set("questions", json.valueToTree(questions));
        var snapshot = rewrite.deepCopy();

        assertThatCode(() -> SessionRecordPolicy.validateStructure("session", session)).doesNotThrowAnyException();
        answer.put("text", "补充后的回答");
        assertThatCode(() -> SessionRecordPolicy.validateStructure("session", session)).doesNotThrowAnyException();
        assertThat(answer.path("questionRewrite")).isEqualTo(snapshot);
        assertThat(answer.path("question").asText()).isEqualTo(SpokenExtractionFixture.ORIGINAL);
    }

    @Test
    void validateStructure_evidenceRefersToMissingOrUncoveredExcerpt_rejects() throws Exception {
        var session = extracted();
        var query = (ObjectNode) session.path("answers").path(0).path("retrieval").path("queries").path(0);
        query.putArray("excerptIds").add("missing");
        assertThatThrownBy(() -> SessionRecordPolicy.validateStructure("session", session)).isInstanceOf(ApiException.class);
    }

    @Test
    void validateStructure_historicalQuestionAsCurrentSource_rejects() throws Exception {
        var session = extracted();
        var question = (ObjectNode) session.path("answers").path(0).path("questionRewrite").path("questions").path(0);
        question.putArray("sourceTexts").add("历史上问过 Redis？");
        assertThatThrownBy(() -> SessionRecordPolicy.validateStructure("session", session)).isInstanceOf(ApiException.class);
    }

    @Test
    void validateStructure_degradedExtractionWithQuestions_rejects() throws Exception {
        var session = extracted();
        ((ObjectNode) session.path("answers").path(0).path("questionRewrite")).put("status", "degraded");
        assertThatThrownBy(() -> SessionRecordPolicy.validateStructure("session", session)).isInstanceOf(ApiException.class);
    }

    @Test
    void validateStructure_fictionalCombinedQueryOrAggregateHybrid_rejects() throws Exception {
        var session = extracted();
        var retrieval = (ObjectNode) session.path("answers").path(0).path("retrieval");
        ((ObjectNode) retrieval.path("queries").path(0)).put("query", "虚构拼接查询");
        assertThatThrownBy(() -> SessionRecordPolicy.validateStructure("session", session)).isInstanceOf(ApiException.class);
        ((ObjectNode) retrieval.path("queries").path(0)).remove("query");
        retrieval.putObject("hybrid").put("candidateCount", 50);
        assertThatThrownBy(() -> SessionRecordPolicy.validateStructure("session", session)).isInstanceOf(ApiException.class);
    }

    @Test
    void validateStructure_editedOldSubtitle_preservesImmutableExtractionAndAllowsFurtherSync() throws Exception {
        var session = session();
        var answer = (ObjectNode) session.path("answers").path(0);
        answer.put("question", "它有什么限制？");
        answer.set("questionRewrite", json.readTree("""
                {"resultFormat":"questions-v1","status":"rewritten","questions":[{"id":"q1","question":"Redis 有什么限制？",
                 "sourceTexts":["它有什么限制？"],"contextSourceTexts":["这里提到 Redis。"]}],
                 "reason":null,"model":"synthetic","durationMs":700,"platformVersion":8}
                """));
        var segment = session.putArray("segments").addObject().put("id", "context").put("text", "这里提到 Redis。")
                .put("startMs", 0).put("isFinal", true);
        var snapshot = answer.path("questionRewrite").deepCopy();
        assertThatCode(() -> SessionRecordPolicy.validateStructure("session", session)).doesNotThrowAnyException();

        segment.put("text", "这里提到缓存。");

        assertThatCode(() -> SessionRecordPolicy.validateStructure("session", session)).doesNotThrowAnyException();
        session.putArray("segments");
        assertThatCode(() -> SessionRecordPolicy.validateStructure("session", session)).doesNotThrowAnyException();
        assertThat(answer.path("questionRewrite")).isEqualTo(snapshot);
    }

    private ObjectNode extracted() throws Exception {
        var session = session();
        var answer = (ObjectNode) session.path("answers").path(0);
        answer.put("question", "什么是 SSE？");
        answer.set("questionRewrite", json.readTree("""
                {"resultFormat":"questions-v1","status":"rewritten","questions":[{"id":"q1","question":"什么是 SSE？","sourceTexts":["什么是 SSE？"]}],
                 "reason":null,"model":"synthetic","durationMs":700,"platformVersion":8}
                """));
        answer.set("retrieval", json.readTree("""
                {"status":"ready","excerpts":[{"excerptId":"e1","questionIds":["q1"],"source":"platform","text":"实际证据"}],
                 "queries":[{"questionId":"q1","status":"ready","message":"","referenceStatus":"ready","excerptIds":["e1"]}]}
                """));
        return session;
    }

    private ObjectNode session() throws Exception {
        return (ObjectNode) json.readTree("{\"id\":\"session\",\"title\":\"会话\",\"createdAt\":\"2026-11-12T12:00:00+08:00\",\"segments\":[],\"answers\":[{\"id\":\"answer\",\"question\":\"原问题\",\"text\":\"回答\",\"status\":\"complete\",\"createdAt\":\"2026-11-12T12:00:00+08:00\"}]}");
    }
}
