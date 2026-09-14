package com.interview.copilot.service.downloads;

import com.interview.copilot.dto.downloads.ClientDownloadFile;
import com.interview.copilot.dto.downloads.ClientDownloadInput;
import com.interview.copilot.response.downloads.ClientDownloadResponse;
import com.interview.copilot.response.downloads.ClientUploadResponse;

import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 客户端最新安装包管理。
 */
public interface ClientDownloadService {
    List<ClientDownloadResponse> list();

    ClientUploadResponse upload(long actorId, String id, MultipartFile file);

    ClientDownloadResponse save(long actorId, String id, ClientDownloadInput input);

    ClientDownloadFile download(String platform, String architecture);

    void cleanup();
}
