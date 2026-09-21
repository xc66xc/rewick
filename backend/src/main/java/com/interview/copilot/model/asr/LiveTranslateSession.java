package com.interview.copilot.model.asr;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.exception.ai.ProviderErrors;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * @author Carl Wang
 * @date 2026-09-21
 * @description 将千问实时翻译会话的原文识别转换为桌面字幕协议，不输出译文。
 */
public final class LiveTranslateSession {
    public static final String MODEL = "qwen3.8-livetranslate-flash-realtime";
    private static final String TRANSCRIPTION = "conversation.item.input_audio_transcription.";
    private final Map<String, ObjectNode> sentences = new LinkedHashMap<>();
    private long lastStart = -1;
    private volatile long audioBytes;

    public static URI endpoint(String url, String model) {
        URI uri = URI.create(url);
        if (!MODEL.equals(model)) return uri;
        if (!"/api-ws/v1/realtime".equals(uri.getPath()) || uri.getFragment() != null) {
            throw new com.interview.copilot.exception.ApiException(
                    org.springframework.http.HttpStatus.BAD_REQUEST,
                    "ASR_REALTIME_ENDPOINT_REQUIRED", "该模型需要 /api-ws/v1/realtime 接口地址。");
        }
        if (uri.getRawQuery() != null) {
            throw ProviderErrors.invalid();
        }
        return URI.create(url + "?model=" + URLEncoder.encode(model, StandardCharsets.UTF_8));
    }

    public Map<String, Object> run() {
        return Map.of("type", "session.update", "session", Map.of(
                "output_modalities", List.of("text"),
                "audio", Map.of("input", Map.of("format", Map.of("type", "pcm", "sample_rate", 16000))),
                "translation", Map.of("language", "zh")));
    }

    public Map<String, Object> audio(ByteBuffer buffer) {
        byte[] bytes = new byte[buffer.remaining()];
        buffer.get(bytes);
        audioBytes += bytes.length;
        return Map.of("type", "input_audio_buffer.append", "audio", Base64.getEncoder().encodeToString(bytes));
    }

    public Map<String, Object> finish() {
        return Map.of("type", "session.finish");
    }

    public Optional<JsonNode> receive(JsonNode input, String taskId) {
        String type = input.path("type").asText();
        return switch (type) {
            case "session.updated" -> Optional.of(event("task-started", taskId));
            case "session.finished" -> Optional.of(event("task-finished", taskId));
            case "error", TRANSCRIPTION + "failed" -> Optional.of(failure(input, taskId));
            case "input_audio_buffer.speech_started" -> {
                sentence(input);
                yield Optional.empty();
            }
            case TRANSCRIPTION + "delta", TRANSCRIPTION + "completed" -> transcript(input, taskId);
            default -> {
                if (type.isEmpty()) throw ProviderErrors.failed();
                // Session metadata, VAD notifications and translated output are not source captions.
                yield Optional.empty();
            }
        };
    }

    private Optional<JsonNode> transcript(JsonNode input, String taskId) {
        ObjectNode sentence = sentence(input);
        if (sentence.path("sentence_end").asBoolean()) return Optional.empty();
        boolean completed = input.path("type").asText().endsWith(".completed");
        JsonNode value = input.path(completed ? "transcript" : "delta");
        if (!value.isTextual()) throw ProviderErrors.failed();
        String text = completed ? value.asText() : sentence.path("text").asText() + value.asText();
        if (text.length() > 10000) throw ProviderErrors.failed();
        sentence.put("text", text).put("sentence_end", completed);
        if (completed) sentence.put("end_time", Math.max(sentence.path("begin_time").asLong(), audioBytes / 32));
        ObjectNode result = event("result-generated", taskId);
        result.withObject("/payload").putObject("output").set("sentence", sentence.deepCopy());
        return Optional.of(result);
    }

    private ObjectNode sentence(JsonNode input) {
        String id = input.path("item_id").asText();
        if (id.isEmpty() || id.length() > 256) throw ProviderErrors.failed();
        ObjectNode existing = sentences.get(id);
        if (existing != null) return existing;
        if (sentences.size() >= 256) {
            String finished = sentences.entrySet().stream()
                    .filter(entry -> entry.getValue().path("sentence_end").asBoolean())
                    .map(Map.Entry::getKey).findFirst().orElseThrow(ProviderErrors::failed);
            sentences.remove(finished);
        }
        long start = Math.max(lastStart + 1, input.path("audio_start_ms").asLong(audioBytes / 32));
        lastStart = start;
        ObjectNode sentence = JsonNodeFactory.instance.objectNode().put("begin_time", start).put("text", "");
        sentences.put(id, sentence);
        return sentence;
    }

    private ObjectNode failure(JsonNode input, String taskId) {
        ObjectNode result = event("task-failed", taskId);
        result.withObject("/header").put("error_code", input.path("error").path("code").asText());
        return result;
    }

    private ObjectNode event(String name, String taskId) {
        ObjectNode frame = JsonNodeFactory.instance.objectNode();
        frame.putObject("header").put("event", name).put("task_id", taskId);
        frame.putObject("payload");
        return frame;
    }
}
