package com.interview.copilot.model.asr;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.nio.ByteBuffer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * @author Carl Wang
 * @date 2026-09-21
 * @description 验证原文增量、句子隔离、结束和错误映射。
 */
class LiveTranslateSessionTest {
    private final ObjectMapper json = new ObjectMapper();
    private final LiveTranslateSession session = new LiveTranslateSession();

    @Test
    void receive_deltasAndFinal_assemblesSourceOnly() throws Exception {
        session.receive(frame("input_audio_buffer.speech_started", "a", "audio_start_ms", 100), "task");
        assertThat(caption("delta", "a", "delta", "你").path("text").asText()).isEqualTo("你");
        assertThat(caption("delta", "a", "delta", "好").path("text").asText()).isEqualTo("你好");
        assertThat(session.receive(frame("response.text.delta", "translation", "delta", "hello"), "task")).isEmpty();
        JsonNode result = caption("completed", "a", "transcript", "你好！");
        assertThat(result.path("text").asText()).isEqualTo("你好！");
        assertThat(result.path("sentence_end").asBoolean()).isTrue();
        assertThat(result.path("begin_time").asLong()).isEqualTo(100);
        assertThat(session.receive(frame("conversation.item.input_audio_transcription.completed", "a", "transcript", "你好！"), "task")).isEmpty();
    }

    @Test
    void receive_interleavedItems_keepsUniqueStableSegments() throws Exception {
        long first = caption("delta", "a", "delta", "一").path("begin_time").asLong();
        long second = caption("delta", "b", "delta", "二").path("begin_time").asLong();
        assertThat(second).isGreaterThan(first);
        JsonNode result = caption("delta", "a", "delta", "三");
        assertThat(result.path("text").asText()).isEqualTo("一三");
        assertThat(result.path("begin_time").asLong()).isEqualTo(first);
    }

    @Test
    void receive_metadataAndErrors_preservesLifecycleWithoutSecrets() throws Exception {
        assertThat(session.receive(json.readTree("{\"type\":\"session.created\"}"), "t")).isEmpty();
        assertThat(session.receive(json.readTree("{\"type\":\"session.updated\"}"), "t").orElseThrow().at("/header/event").asText()).isEqualTo("task-started");
        assertThat(session.receive(json.readTree("{\"type\":\"session.finished\"}"), "t").orElseThrow().at("/header/event").asText()).isEqualTo("task-finished");
        JsonNode failed = session.receive(json.readTree("{\"type\":\"error\",\"error\":{\"code\":\"InvalidApiKey\",\"message\":\"secret\"}}"), "t").orElseThrow();
        assertThat(failed.toString()).contains("task-failed", "InvalidApiKey").doesNotContain("secret");
    }

    @Test
    void endpoint_wrongProtocol_rejectsInsteadOfRewriting() {
        assertThatThrownBy(() -> LiveTranslateSession.endpoint("wss://example.test/api-ws/v1/inference", LiveTranslateSession.MODEL)).hasMessageContaining("/api-ws/v1/realtime");
        assertThat(LiveTranslateSession.endpoint("wss://example.test/api-ws/v1/realtime", LiveTranslateSession.MODEL).getQuery()).isEqualTo("model=" + LiveTranslateSession.MODEL);
        assertThat(session.audio(ByteBuffer.wrap(new byte[]{1, 2}))).containsEntry("audio", "AQI=");
        assertThat(session.finish()).containsEntry("type", "session.finish");
    }

    @Test
    void receive_oversizeText_failsWithBoundedMemory() {
        assertThatThrownBy(() -> caption("delta", "a", "delta", "a".repeat(10001))).isInstanceOf(com.interview.copilot.exception.ApiException.class);
    }

    private JsonNode caption(String kind, String id, String field, String text) throws Exception {
        return session.receive(frame("conversation.item.input_audio_transcription." + kind, id, field, text), "task")
                .orElseThrow().at("/payload/output/sentence");
    }

    private JsonNode frame(String type, String id, String field, Object value) {
        return json.valueToTree(java.util.Map.of("type", type, "item_id", id, field, value));
    }
}
