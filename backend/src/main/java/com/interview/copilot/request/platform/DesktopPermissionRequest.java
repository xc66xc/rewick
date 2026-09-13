package com.interview.copilot.request.platform;

import jakarta.validation.constraints.NotNull;

/**
 * @author Carl Wang
 * @date 2026-09-13
 * @description 桌面高级设置权限与平台默认配置。
 */
public record DesktopPermissionRequest(@NotNull Boolean enabled) {}
