package com.interview.copilot.common.payment;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import java.util.List;
import java.util.Map;
import java.util.UUID;

class SessionRecordsIntegrationTest extends PaymentHttpFixture {
    @org.springframework.beans.factory.annotation.Autowired
    private com.interview.copilot.service.wallet.WalletService wallets;

    @Test
    void pageAndDetail_linkedInterview_returnAuthoritativeUsage() {
        wallets.state(1);
        jdbc.update("UPDATE time_wallets SET available_seconds=7200 WHERE app_users_id=1");
        var session = wallets.start(1, UUID.randomUUID().toString()).session();
        var content = new java.util.HashMap<String, Object>(record("timed"));
        content.put("interviewSessionId", session.id());
        var body = Map.of("version", 0, "mutationId", UUID.randomUUID().toString(), "record", content);
        assertThat(call(HttpMethod.POST, "/session-records/timed", aliceToken, body).getStatusCode().value()).isEqualTo(200);
        jdbc.update("UPDATE interview_sessions SET used_seconds=3661 WHERE session_id=?", session.id());

        var detail = call(HttpMethod.GET, "/session-records/timed", aliceToken, null).getBody();
        var page = call(HttpMethod.GET, "/session-records", aliceToken, null).getBody();
        assertThat(detail.path("record").path("usedSeconds").asLong()).isEqualTo(3661);
        assertThat(page.path("records").get(0).path("usedSeconds").asLong()).isEqualTo(3661);
        assertThat(call(HttpMethod.GET, "/session-records/timed", bobToken, null).getStatusCode().value()).isEqualTo(404);
    }

    @Test
    void save_configuredLimitChanges_applyToWritesWithoutBlockingExistingReads() {
        jdbc.update("UPDATE desktop_settings SET session_record_max_mib=20 WHERE id=1");
        var content = new java.util.HashMap<String, Object>(record("large"));
        var segments = new java.util.ArrayList<Map<String, Object>>();
        for (int i = 0; i < 100; i++) {
            segments.add(Map.of("id", "segment-" + i, "text", "中".repeat(20000),
                    "startMs", i, "isFinal", true));
        }
        content.put("segments", segments);
        var body = Map.of("version", 0, "mutationId", UUID.randomUUID().toString(), "record", content);
        try {
            assertThat(call(HttpMethod.POST, "/session-records/large", aliceToken, body)
                    .getStatusCode().value()).isEqualTo(200);
            jdbc.update("UPDATE desktop_settings SET session_record_max_mib=1 WHERE id=1");
            // A response-lost replay is already committed and must survive a later lower limit.
            var replay = call(HttpMethod.POST, "/session-records/large", aliceToken, body);
            assertThat(replay.getStatusCode().value()).isEqualTo(200);
            assertThat(replay.getBody().path("version").asLong()).isEqualTo(1);
            assertThat(call(HttpMethod.GET, "/session-records/large", aliceToken, null)
                    .getBody().path("record").path("segments").size()).isEqualTo(100);
            var next = Map.of("version", 1, "mutationId", UUID.randomUUID().toString(), "record", content);
            var rejected = call(HttpMethod.POST, "/session-records/large", aliceToken, next);
            assertThat(rejected.getStatusCode().value()).isEqualTo(400);
            assertThat(rejected.getBody().path("code").asText()).isEqualTo("SESSION_RECORD_TOO_LARGE");
            assertThat(call(HttpMethod.GET, "/session-records/large", bobToken, null)
                    .getStatusCode().value()).isEqualTo(404);
        } finally {
            jdbc.update("UPDATE desktop_settings SET session_record_max_mib=20 WHERE id=1");
        }
    }

    private Map<String, Object> record(String id) {
        return Map.of("id", id, "title", "技术面试", "createdAt", "2026-09-12T10:00:00Z",
                "segments", List.of(Map.of("id", "segment", "text", "你好", "startMs", 0, "isFinal", true)), "answers", List.of());
    }

    @Test
    void detail_extractionFormatNegotiation_preservesStoredOriginalAndActualSources() {
        var content = new java.util.HashMap<String, Object>(record("extracted"));
        var extraction = new java.util.HashMap<String, Object>();
        extraction.put("resultFormat", "questions-v1");
        extraction.put("status", "rewritten");
        extraction.put("questions", List.of(Map.of("id", "q1", "question", "什么是 SSE？", "sourceTexts", List.of("什么是 SSE？"))));
        extraction.put("reason", null);
        extraction.put("model", "synthetic-model");
        extraction.put("durationMs", 700);
        extraction.put("platformVersion", 8);
        var retrieval = Map.of("status", "ready", "excerpts", List.of(Map.of("excerptId", "e1", "questionIds", List.of("q1"),
                "source", "platform", "text", "真实的 SSE 参考片段", "documentId", "synthetic-document", "chunkId", "synthetic-context")),
                "queries", List.of(Map.of("questionId", "q1", "status", "ready", "excerptIds", List.of("e1"))));
        content.put("answers", List.of(Map.of("id", "answer", "question", "什么是 SSE？", "text", "完整回答", "status", "complete",
                "createdAt", "2026-11-13T10:00:00+08:00", "questionRewrite", extraction, "retrieval", retrieval,
                "modelInput", Map.of("messages", List.of(Map.of("role", "user", "content", "实际模型输入"))))));
        var body = Map.of("version", 0, "mutationId", UUID.randomUUID().toString(), "record", content);
        assertThat(call(HttpMethod.POST, "/session-records/extracted", aliceToken, body).getStatusCode().value()).isEqualTo(200);

        var legacy = call(HttpMethod.GET, "/session-records/extracted", aliceToken, null).getBody().path("record").path("answers").path(0);
        var modern = call(HttpMethod.GET, "/session-records/extracted?resultFormat=questions-v1", aliceToken, null).getBody().path("record").path("answers").path(0);

        assertThat(legacy.has("questionRewrite")).isFalse();
        assertThat(legacy.path("retrieval").has("queries")).isFalse();
        assertThat(legacy.path("retrieval").path("excerpts").path(0).path("text").asText()).isEqualTo("真实的 SSE 参考片段");
        assertThat(legacy.path("modelInput")).isEqualTo(modern.path("modelInput"));
        assertThat(modern.path("questionRewrite").path("questions").path(0).path("id").asText()).isEqualTo("q1");
        assertThat(call(HttpMethod.GET, "/session-records/extracted?resultFormat=questions-v1", bobToken, null).getStatusCode().value()).isEqualTo(404);
    }
    @Test
    void save_retriesVersionsAndDeletion_preventDuplicatesAndResurrection() {
        var body = Map.of("version", 0, "mutationId", UUID.randomUUID().toString(), "record", record("one"));
        var first = call(HttpMethod.POST, "/session-records/one", aliceToken, body);
        assertThat(first.getStatusCode().value()).isEqualTo(200);
        assertThat(call(HttpMethod.POST, "/session-records/one", aliceToken, body).getBody()).isEqualTo(first.getBody());
        var stale = Map.of("version", 0, "mutationId", UUID.randomUUID().toString(), "record", record("one"));
        assertThat(call(HttpMethod.POST, "/session-records/one", aliceToken, stale).getStatusCode().value()).isEqualTo(409);
        assertThat(call(HttpMethod.GET, "/session-records/one", bobToken, null).getStatusCode().value()).isEqualTo(404);
        assertThat(call(HttpMethod.POST, "/session-records/one/delete", bobToken, Map.of()).getStatusCode().value()).isEqualTo(404);
        call(HttpMethod.POST, "/session-records/one/delete", aliceToken, Map.of());
        assertThat(call(HttpMethod.POST, "/session-records/one", aliceToken, body).getStatusCode().value()).isEqualTo(410);
        assertThat(jdbc.queryForObject("SELECT content::text FROM session_records", String.class)).isEqualTo("{}");
    }
    @Test
    void page_returnsSummariesAndCursor_withoutOtherUserRecords() {
        for (int i = 0; i < 21; i++) {
            String id = "record-" + i;
            var body = Map.of("version", 0, "mutationId", UUID.randomUUID().toString(), "record", record(id));
            assertThat(call(HttpMethod.POST, "/session-records/" + id, aliceToken, body).getStatusCode().value()).isEqualTo(200);
        }
        var page = call(HttpMethod.GET, "/session-records", aliceToken, null).getBody();
        assertThat(page.path("records").size()).isEqualTo(20);
        assertThat(page.path("records").get(0).path("usedSeconds").isNull()).isTrue();
        assertThat(page.path("records").get(0).path("segments").size()).isZero();
        assertThat(page.path("records").get(0).path("segmentCount").asInt()).isEqualTo(1);
        var next = call(HttpMethod.GET, "/session-records?cursor=" + page.path("nextCursor").asText(), aliceToken, null).getBody();
        assertThat(next.path("records").size()).isEqualTo(1);
        assertThat(call(HttpMethod.GET, "/session-records", bobToken, null).getBody().path("records").size()).isZero();
    }
}
