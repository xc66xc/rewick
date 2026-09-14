package com.interview.copilot.controller.downloads;

import com.interview.copilot.dto.downloads.ClientDownloadInput;
import com.interview.copilot.request.downloads.ClientDownloadRequest;
import com.interview.copilot.response.downloads.ClientDownloadResponse;
import com.interview.copilot.response.downloads.ClientUploadResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.downloads.ClientDownloadService;

import jakarta.validation.Valid;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 客户端最新安装包管理。
 */
@RestController
public class ClientDownloadController {
    private final ClientDownloadService service;

    public ClientDownloadController(ClientDownloadService service) {
        this.service = service;
    }

    @GetMapping({"/api/v1/client-downloads", "/api/v1/admin/client-downloads"})
    public List<ClientDownloadResponse> list() {
        return service.list();
    }

    @PostMapping(
            value = "/api/v1/admin/client-downloads/{id}/upload",
            consumes = "multipart/form-data")
    public ClientUploadResponse upload(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable String id,
            @RequestPart("file") MultipartFile file) {
        return service.upload(user.id(), id, file);
    }

    @PutMapping("/api/v1/admin/client-downloads/{id}")
    public ClientDownloadResponse save(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable String id,
            @Valid @RequestBody ClientDownloadRequest body) {
        return service.save(
                user.id(),
                id,
                new ClientDownloadInput(
                        body.version(),
                        body.minimumOsVersion(),
                        body.releaseNotes(),
                        body.enabled(),
                        body.uploadId()));
    }

    @GetMapping("/downloads/{platform}/{architecture}")
    public ResponseEntity<Void> download(
            @PathVariable String platform, @PathVariable String architecture) {
        var file = service.download(platform, architecture);
        return ResponseEntity.ok()
                .header("X-Accel-Redirect", file.internalPath())
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment()
                                .filename(file.filename())
                                .build()
                                .toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .build();
    }
}
