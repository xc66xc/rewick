package com.interview.copilot.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class ProviderJson {
    private final ObjectMapper mapper;

    public ProviderJson(ObjectMapper mapper) { this.mapper = mapper; }

    public JsonNode parse(String text) {
        try {
            return mapper.readTree(text);
        } catch (JsonProcessingException exception) {
            throw ProviderErrors.failed();
        }
    }

    public String encode(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw ProviderErrors.failed();
        }
    }

    public Map<String, Object> completion(JsonNode input, String mode) {
        if (!input.isObject() || input.has("error")) { throw ProviderErrors.failed(); }
        JsonNode value = input.path("choices").path(0).path(mode).path("content");
        if (!value.isMissingNode() && !value.isNull() && !value.isTextual()) { throw ProviderErrors.failed(); }
        String content = value.isTextual() ? value.asText() : "";
        if (content.length() > 32768 || ("message".equals(mode) && content.isBlank())) {
            throw ProviderErrors.failed();
        }
        Map<String, Object> result = new HashMap<>();
        result.put("choices", List.of(Map.of("index", 0, mode, Map.of("content", content))));
        Map<String, Long> usage = usage(input.path("usage"));
        if (!usage.isEmpty()) { result.put("usage", usage); }
        return result;
    }

    private Map<String, Long> usage(JsonNode input) {
        Map<String, Long> result = new HashMap<>();
        for (String name : List.of("prompt_tokens", "completion_tokens", "total_tokens")) {
            JsonNode value = input.path(name);
            if (value.isIntegralNumber() && value.canConvertToLong() && value.asLong() >= 0
                    && value.asLong() <= 1000000000) { result.put(name, value.asLong()); }
        }
        return result;
    }
}
