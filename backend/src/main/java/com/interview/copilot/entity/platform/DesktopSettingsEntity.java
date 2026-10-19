package com.interview.copilot.entity.platform;

/**
 * @author Carl Wang
 * @date 2026-09-13
 * @description 桌面高级设置权限与平台默认配置。
 */
public record DesktopSettingsEntity(
        long version,
        String llmModelId,
        double temperature,
        String asrServiceId) {}
