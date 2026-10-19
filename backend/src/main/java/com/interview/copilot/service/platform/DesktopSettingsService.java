package com.interview.copilot.service.platform;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.response.platform.DesktopSettingsResponse;
import com.interview.copilot.response.platform.DesktopUserResponse;

import java.util.List;

/**
 * @author Carl Wang
 * @date 2026-09-13
 * @description 桌面高级设置权限与平台默认配置。
 */
public interface DesktopSettingsService {
    DesktopSettingsResponse get();

    DesktopSettingsResponse save(long actor, DesktopSettingsResponse input);

    boolean advanced(long user);

    List<DesktopUserResponse> users();

    void permission(long actor, long user, boolean enabled);

    ObjectNode llm(long user, ObjectNode input);

    String asr(long user, String requested);

}
