package com.interview.copilot.validation.background;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.model.background.BackgroundKind;

import org.springframework.http.HttpStatus;

import java.util.Set;
import java.util.UUID;

/**
 * @author Carl Wang
 * @date 2026-09-20
 * @description 校验用户背景资料及面试类型
 */
public final class BackgroundPolicy {
    private BackgroundPolicy() {}

    public static void id(String id) {
        try {
            if (!UUID.fromString(id).toString().equalsIgnoreCase(id))
                throw new IllegalArgumentException();
        } catch (RuntimeException e) {
            throw invalid("资料 ID 无效。");
        }
    }

    public static ObjectNode content(BackgroundKind kind, JsonNode value) {
        if (!(value instanceof ObjectNode object)) throw invalid("资料格式无效。");
        Set<String> allowed =
                switch (kind) {
                    case resumes -> Set.of("name", "text");
                    case targets -> Set.of("name", "companyName", "roleName", "jobDescription");
                    case environments -> Set.of("name", "interviewType", "resumeId", "targetId", "referenceIds");
                };
        object.fieldNames()
                .forEachRemaining(
                        key -> {
                            if (!allowed.contains(key)) throw invalid("资料包含不支持的字段。");
                        });
        text(object, "name", kind == BackgroundKind.environments ? 100 : 255);
        if (object.path("name").asText().isBlank()) throw invalid("请填写名称。");
        switch (kind) {
            case resumes -> text(object, "text", 100000);
            case targets -> {
                text(object, "companyName", 200);
                text(object, "roleName", 200);
                text(object, "jobDescription", 12000);
            }
            case environments -> {
                interviewType(object.path("interviewType"));
                for (String key : Set.of("resumeId", "targetId")) {
                    if (!object.has(key)) throw invalid("请选择简历和岗位。");
                    if (!object.get(key).isNull()) id(object.get(key).asText());
                }
                JsonNode refs = object.path("referenceIds");
                if (!refs.isArray() || refs.size() > 30) throw invalid("每个环境最多选择 30 份资料。");
                Set<String> ids = new java.util.HashSet<>();
                refs.forEach(
                        ref -> {
                            id(ref.asText());
                            if (!ids.add(ref.asText())) throw invalid("参考资料不能重复。");
                        });
            }
        }
        return object.deepCopy();
    }

    private static void text(ObjectNode node, String key, int max) {
        if (!node.path(key).isTextual() || node.path(key).asText().length() > max)
            throw invalid("资料字段长度或格式无效：" + key);
    }

    /** 校验面试类型，仅接受明确的技术面试或综合面试。 */
    public static void interviewType(JsonNode value) {
        if (!value.isTextual() || !Set.of("technical", "general").contains(value.asText())) {
            throw invalid("请选择有效的面试类型：技术面试或综合面试。");
        }
    }

    public static ApiException invalid(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "BACKGROUND_INVALID", message);
    }
}
