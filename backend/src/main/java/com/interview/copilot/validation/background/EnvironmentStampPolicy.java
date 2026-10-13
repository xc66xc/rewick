package com.interview.copilot.validation.background;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.NullNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.request.background.SaveEnvironmentStampRequest;

import java.util.Set;
import java.util.regex.Pattern;

public final class EnvironmentStampPolicy {
    private static final Set<String> REQUEST_FIELDS = Set.of("version", "mutationId", "stamp");
    private static final Set<String> STAMP_FIELDS = Set.of("text", "color");
    private static final Set<String> COLORS = Set.of("blue", "amber", "green", "red");
    private static final Pattern EDGE_SPACES = Pattern.compile("^[\\s\\p{Zs}\\uFEFF]+|[\\s\\p{Zs}\\uFEFF]+$");

    private EnvironmentStampPolicy() {}

    public static SaveEnvironmentStampRequest request(JsonNode body) {
        fields(body, REQUEST_FIELDS);
        JsonNode version = body.path("version");
        if (!version.isIntegralNumber() || !version.canConvertToLong() || version.longValue() < 1)
            throw BackgroundPolicy.invalid("印章版本必须是正整数。");
        if (!body.path("mutationId").isTextual() || !body.has("stamp"))
            throw BackgroundPolicy.invalid("请提供保存标识和印章；清除印章请明确传入 null。");
        String mutation = body.path("mutationId").asText();
        BackgroundPolicy.id(mutation);
        return new SaveEnvironmentStampRequest(version.longValue(), mutation, stamp(body.get("stamp")));
    }

    public static JsonNode stamp(JsonNode value) {
        if (value != null && value.isNull()) return NullNode.getInstance();
        fields(value, STAMP_FIELDS);
        if (!value.path("text").isTextual() || !value.path("color").isTextual()
                || !COLORS.contains(value.path("color").asText()))
            throw BackgroundPolicy.invalid("请填写印章文字并选择有效颜色。");
        String raw = value.path("text").asText();
        if (raw.codePoints().anyMatch(EnvironmentStampPolicy::invalidCodePoint))
            throw BackgroundPolicy.invalid("印章文字不能包含换行或控制符。");
        String text = EDGE_SPACES.matcher(raw).replaceAll("");
        int length = text.codePointCount(0, text.length());
        if (length < 1 || length > 8) throw BackgroundPolicy.invalid("印章文字须为 1–8 个字符。");
        ObjectNode result = ((ObjectNode) value).deepCopy();
        result.put("text", text);
        return result;
    }

    private static boolean invalidCodePoint(int point) {
        return Character.isISOControl(point) || point == 0x2028 || point == 0x2029
                || (point >= Character.MIN_SURROGATE && point <= Character.MAX_SURROGATE);
    }

    private static void fields(JsonNode value, Set<String> allowed) {
        if (!(value instanceof ObjectNode)) throw BackgroundPolicy.invalid("印章格式无效。");
        value.fieldNames().forEachRemaining(key -> {
            if (!allowed.contains(key)) throw BackgroundPolicy.invalid("印章包含不支持的字段。");
        });
    }
}
