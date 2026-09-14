package com.interview.copilot.response.downloads;

import java.time.Instant;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 客户端最新安装包管理。
 */
public record ClientDownloadResponse(
        String id,
        String platform,
        String architecture,
        String version,
        String filename,
        long fileSize,
        String sha256,
        String minimumOsVersion,
        String releaseNotes,
        boolean enabled,
        Instant updatedAt) {}
