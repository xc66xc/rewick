package com.interview.copilot.request.platform;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * @author Carl Wang
 * @date 2026-09-13
 * @description 桌面高级设置权限与平台默认配置。
 */
public record DesktopSettingsRequest(
        @Min(0) long version,
        @NotNull @Size(max = 64) String llmModelId,
        @DecimalMin("0.0") @DecimalMax("2.0") double temperature,
        @NotNull @Size(max = 64) String asrServiceId,
        @NotNull @Pattern(regexp = "local|remote") String retrievalMode,
        @NotNull @Size(max = 64) String knowledgeServiceId) {}
