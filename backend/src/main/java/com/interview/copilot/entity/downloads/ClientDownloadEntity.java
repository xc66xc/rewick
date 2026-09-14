package com.interview.copilot.entity.downloads;

import java.time.LocalDateTime;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 客户端最新安装包管理。
 */
public record ClientDownloadEntity(
        String id,
        String platform,
        String architecture,
        String version,
        String originalFilename,
        String storagePath,
        long fileSize,
        String sha256,
        String minimumOsVersion,
        String releaseNotes,
        boolean enabled,
        LocalDateTime updatedAt) {}
