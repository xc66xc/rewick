package com.interview.copilot.request.downloads;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 客户端最新安装包管理。
 */
public record ClientDownloadRequest(
        @NotNull @Size(max = 64) String version,
        @NotNull @Size(max = 100) String minimumOsVersion,
        @NotNull @Size(max = 4000) String releaseNotes,
        @NotNull Boolean enabled,
        @Size(max = 36) String uploadId) {}
