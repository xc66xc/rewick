package com.interview.copilot.dto.downloads;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 客户端最新安装包管理。
 */
public record ClientDownloadInput(
        String version,
        String minimumOsVersion,
        String releaseNotes,
        boolean enabled,
        String uploadId) {}
