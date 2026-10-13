package com.interview.copilot.service.impl.platform;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.entity.platform.DesktopSettingsEntity;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.mapper.platform.DesktopSettingsMapper;
import com.interview.copilot.mapper.platform.PlatformConfigMapper;
import com.interview.copilot.response.platform.DesktopSettingsResponse;
import com.interview.copilot.response.platform.DesktopUserResponse;
import com.interview.copilot.service.audit.AuditService;
import com.interview.copilot.service.platform.DesktopSettingsService;
import com.interview.copilot.service.platform.PlatformRuntimeService;
import com.interview.copilot.validation.platform.DesktopDefaultsValidator;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * @author Carl Wang
 * @date 2026-09-13
 * @description 桌面高级设置权限与平台默认配置。
 */
@Service
public class DesktopSettingsServiceImpl implements DesktopSettingsService {
    private final DesktopSettingsMapper mapper;
    private final PlatformConfigMapper config;
    private final PlatformRuntimeService runtime;
    private final AuditService audit;

    public DesktopSettingsServiceImpl(
            DesktopSettingsMapper mapper,
            PlatformConfigMapper config,
            PlatformRuntimeService runtime,
            AuditService audit) {
        this.mapper = mapper;
        this.config = config;
        this.runtime = runtime;
        this.audit = audit;
    }

    public DesktopSettingsResponse get() {
        return response(mapper.read());
    }

    public boolean advanced(long user) {
        return Boolean.TRUE.equals(mapper.permitted(user));
    }

    public List<DesktopUserResponse> users() {
        return mapper.users().stream()
                .map(
                        value ->
                                new DesktopUserResponse(
                                        value.id(), value.displayName(), value.email()))
                .toList();
    }

    @Transactional
    public void permission(long actor, long user, boolean enabled) {
        if (mapper.permission(user, enabled) != 1) {
            throw new ApiException(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "用户不存在。");
        }
        if (!enabled) mapper.clearWebSearch(user);
        audit.record(actor, "desktop.permission.update", "user:" + user + ",enabled:" + enabled);
    }

    @Transactional
    public DesktopSettingsResponse save(long actor, DesktopSettingsResponse input) {
        config.lock();
        DesktopSettingsEntity value =
                new DesktopSettingsEntity(
                        input.version(),
                        input.llmModelId(),
                        input.temperature(),
                        input.asrServiceId(),
                        input.retrievalMode(),
                        input.knowledgeServiceId());
        DesktopDefaultsValidator.validate(value, runtime.snapshot());
        if (mapper.save(value) != 1) {
            throw new ApiException(
                    HttpStatus.CONFLICT, "DESKTOP_SETTINGS_CONFLICT", "配置已被修改，请刷新后重试。");
        }
        audit.record(actor, "desktop.defaults.update", "version:" + (input.version() + 1));
        return get();
    }

    public ObjectNode llm(long user, ObjectNode input) {
        ObjectNode result = input.deepCopy();
        if (advanced(user)) {
            return result;
        }
        var value = get();
        String requested = input.has("model") ? input.get("model").asText() : null;
        result.put("model", selection(requested, value.llmModelId()));
        if (input.has("temperature")
                && (!input.get("temperature").isNumber()
                        || Double.compare(input.get("temperature").asDouble(), value.temperature())
                                != 0)) {
            throw forbidden();
        }
        result.put("temperature", value.temperature());
        return result;
    }

    public String asr(long user, String requested) {
        return advanced(user) ? requested : selection(requested, get().asrServiceId());
    }

    public String knowledge(long user, String requested) {
        if (advanced(user)) {
            return requested;
        }
        var value = get();
        if (!"remote".equals(value.retrievalMode())) {
            throw forbidden();
        }
        return selection(requested, value.knowledgeServiceId());
    }

    public void requireLocal(long user) {
        if (!advanced(user) && !"local".equals(get().retrievalMode())) {
            throw forbidden();
        }
    }

    private String selection(String requested, String configured) {
        if (configured.isEmpty()) {
            throw new ApiException(
                    HttpStatus.SERVICE_UNAVAILABLE, "DESKTOP_DEFAULT_REQUIRED", "管理员尚未配置平台默认服务。");
        }
        if (requested != null && !requested.equals(configured)) {
            throw forbidden();
        }
        return configured;
    }

    private ApiException forbidden() {
        return new ApiException(
                HttpStatus.FORBIDDEN, "ADVANCED_SETTINGS_FORBIDDEN", "当前账号只能使用平台默认模型和检索设置，请刷新设置。");
    }

    private DesktopSettingsResponse response(DesktopSettingsEntity value) {
        if (value == null) {
            throw new ApiException(
                    HttpStatus.SERVICE_UNAVAILABLE, "DESKTOP_SETTINGS_UNAVAILABLE", "桌面配置尚未初始化。");
        }
        return new DesktopSettingsResponse(
                value.version(),
                value.llmModelId(),
                value.temperature(),
                value.asrServiceId(),
                value.retrievalMode(),
                value.knowledgeServiceId());
    }
}
