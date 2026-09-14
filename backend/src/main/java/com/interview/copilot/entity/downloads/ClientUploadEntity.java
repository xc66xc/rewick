package com.interview.copilot.entity.downloads;

import java.time.LocalDateTime;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 客户端最新安装包管理。
 */
public record ClientUploadEntity(
        String id,
        String downloadId,
        long actorId,
        String originalFilename,
        String storagePath,
        long fileSize,
        String sha256,
        LocalDateTime createdAt) {}
