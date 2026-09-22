package com.interview.copilot.validation.background;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.List;

/** Validates per-interview speech terminology and its upstream payload budget. */
public final class HotwordPolicy {
    public static final int MAX_WORDS = 200;
    public static final int MAX_WORD_LENGTH = 80;
    public static final int MAX_VOCABULARY_BYTES = 4096;
    private HotwordPolicy() {}

    public static List<String> words(JsonNode value) {
        if (value.isMissingNode()) return List.of();
        if (!value.isArray() || value.size() > MAX_WORDS)
            throw BackgroundPolicy.invalid("专业术语最多填写 200 个。");
        LinkedHashSet<String> words = new LinkedHashSet<>();
        for (JsonNode item : value) {
            if (!item.isTextual()) throw BackgroundPolicy.invalid("专业术语必须为文字。");
            String word = item.asText().strip();
            if (word.isBlank() || word.length() > MAX_WORD_LENGTH
                    || word.codePoints().anyMatch(Character::isISOControl))
                throw BackgroundPolicy.invalid("专业术语不能为空、包含控制字符或超过 80 个字符。");
            words.add(word);
        }
        List<String> result = List.copyOf(words);
        vocabulary(result);
        return result;
    }

    public static ObjectNode vocabulary(List<String> words) {
        ObjectNode vocabulary = JsonNodeFactory.instance.objectNode();
        words.forEach(word -> vocabulary.put(word, 3));
        if (vocabulary.toString().getBytes(StandardCharsets.UTF_8).length > MAX_VOCABULARY_BYTES)
            throw BackgroundPolicy.invalid("专业术语总长度过大，请减少术语数量或长度。");
        return vocabulary;
    }
}
