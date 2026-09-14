package com.interview.copilot.response.downloads;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 客户端最新安装包管理。
 */
public record ClientUploadResponse(
        String uploadId, String filename, long fileSize, String sha256) {}
