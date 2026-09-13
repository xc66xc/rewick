package com.interview.copilot.validation.platform;

import com.interview.copilot.entity.platform.DesktopSettingsEntity;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.model.platform.PlatformSnapshot;

import org.springframework.http.HttpStatus;

/**
 * @author Carl Wang
 * @date 2026-09-13
 * @description 桌面高级设置权限与平台默认配置。
 */
public final class DesktopDefaultsValidator {
    private DesktopDefaultsValidator() {}

    public static void validate(DesktopSettingsEntity value, PlatformSnapshot snapshot) {
        boolean llm =
                value.llmModelId().isEmpty()
                        || snapshot.availableModels().stream()
                                .anyMatch(item -> item.id().equals(value.llmModelId()));
        boolean asr =
                value.asrServiceId().isEmpty()
                        || snapshot.availableAsrServices().stream()
                                .anyMatch(item -> item.id().equals(value.asrServiceId()));
        boolean knowledge =
                value.knowledgeServiceId().isEmpty()
                        || snapshot.availableKnowledgeServices().stream()
                                .anyMatch(item -> item.id().equals(value.knowledgeServiceId()));
        if (!llm || !asr || !knowledge) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "DESKTOP_DEFAULT_UNAVAILABLE",
                    "默认模型或服务不可用；停用或删除前请先更换桌面默认配置。");
        }
        if ("remote".equals(value.retrievalMode()) && value.knowledgeServiceId().isEmpty()) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST, "DESKTOP_DEFAULT_REQUIRED", "使用远程检索时请选择默认远程知识库。");
        }
    }
}
