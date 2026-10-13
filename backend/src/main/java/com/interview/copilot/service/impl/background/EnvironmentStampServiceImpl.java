package com.interview.copilot.service.impl.background;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.mapper.background.BackgroundMapper;
import com.interview.copilot.model.background.BackgroundKind;
import com.interview.copilot.service.auth.SessionGuardService;
import com.interview.copilot.service.background.BackgroundService;
import com.interview.copilot.service.background.EnvironmentStampService;
import com.interview.copilot.validation.background.BackgroundPolicy;
import com.interview.copilot.validation.background.EnvironmentStampPolicy;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class EnvironmentStampServiceImpl implements EnvironmentStampService {
    private final BackgroundMapper records;
    private final SessionGuardService users;
    private final BackgroundService background;
    private final ObjectMapper json;

    public EnvironmentStampServiceImpl(BackgroundMapper records, SessionGuardService users,
            BackgroundService background, ObjectMapper json) {
        this.records = records;
        this.users = users;
        this.background = background;
        this.json = json;
    }

    public JsonNode save(long user, String id, long version, String mutationId, JsonNode stamp) {
        BackgroundPolicy.id(id);
        BackgroundPolicy.id(mutationId);
        if (version < 1) throw BackgroundPolicy.invalid("印章版本必须是正整数。");
        JsonNode normalized = EnvironmentStampPolicy.stamp(stamp);
        if (users.lockUser(user) == null) throw missing();
        var previous = records.find(user, BackgroundKind.environments, id);
        if (previous == null) throw missing();
        if (previous.deleted()) throw new ApiException(HttpStatus.GONE, "BACKGROUND_DELETED", "环境已删除，不能修改印章。");
        ObjectNode content = parse(previous.content());
        if (previous.mutationId().equalsIgnoreCase(mutationId)) {
            JsonNode saved = content.has("stamp") ? content.get("stamp") : json.nullNode();
            if (!saved.equals(normalized)) throw conflict("保存标识已用于其他内容，请重新提交。");
            return background.detail(user, BackgroundKind.environments, id);
        }
        if (previous.version() != version) throw conflict("环境已被其他设备修改，请刷新后重新编辑；当前草稿未保存。");
        content.set("stamp", normalized);
        records.update(user, BackgroundKind.environments, id, content.toString(), mutationId);
        return background.detail(user, BackgroundKind.environments, id);
    }

    private ObjectNode parse(String content) {
        try {
            return (ObjectNode) json.readTree(content);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("服务器背景资料格式无效", error);
        }
    }

    private ApiException missing() {
        return new ApiException(HttpStatus.NOT_FOUND, "BACKGROUND_NOT_FOUND", "资料不存在或不属于当前用户。");
    }

    private ApiException conflict(String message) {
        return new ApiException(HttpStatus.CONFLICT, "BACKGROUND_CHANGED", message);
    }
}
