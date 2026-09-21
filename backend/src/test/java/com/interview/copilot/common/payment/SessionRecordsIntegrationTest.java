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

    private Map<String, Object> record(String id) {
        return Map.of("id", id, "title", "技术面试", "createdAt", "2026-09-12T10:00:00Z",
                "segments", List.of(Map.of("id", "segment", "text", "你好", "startMs", 0, "isFinal", true)), "answers", List.of());
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
