package com.interview.copilot.job.downloads;

import com.interview.copilot.service.downloads.ClientDownloadService;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 客户端最新安装包管理。
 */
@Component
public class ClientDownloadCleanupJob {
    private final ClientDownloadService service;

    public ClientDownloadCleanupJob(ClientDownloadService service) {
        this.service = service;
    }

    @Scheduled(initialDelay = 3600000, fixedDelay = 3600000)
    public void cleanup() {
        service.cleanup();
    }
}
