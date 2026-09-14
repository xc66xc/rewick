package com.interview.copilot.service.impl.downloads;

import com.interview.copilot.dto.downloads.ClientDownloadFile;
import com.interview.copilot.dto.downloads.ClientDownloadInput;
import com.interview.copilot.entity.downloads.ClientDownloadEntity;
import com.interview.copilot.entity.downloads.ClientUploadEntity;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.mapper.audit.AuditMapper;
import com.interview.copilot.mapper.downloads.ClientDownloadMapper;
import com.interview.copilot.response.downloads.ClientDownloadResponse;
import com.interview.copilot.response.downloads.ClientUploadResponse;
import com.interview.copilot.service.downloads.ClientDownloadService;
import com.interview.copilot.util.ServerTime;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 客户端最新安装包管理。
 */
@Service
public class ClientDownloadServiceImpl implements ClientDownloadService {
    private static final Logger LOG = LoggerFactory.getLogger(ClientDownloadServiceImpl.class);
    private static final long MAX_BYTES = 524288000L;
    private final ClientDownloadMapper mapper;
    private final AuditMapper audit;
    private final Path root;
    private final Clock clock;

    public ClientDownloadServiceImpl(
            ClientDownloadMapper mapper,
            AuditMapper audit,
            Clock clock,
            @Value("${copilot.downloads.directory:./data/client-downloads}") String directory) {
        this.mapper = mapper;
        this.audit = audit;
        this.clock = clock;
        this.root = Path.of(directory).toAbsolutePath().normalize();
    }

    public List<ClientDownloadResponse> list() {
        return mapper.list().stream().map(this::response).toList();
    }

    @Transactional
    public ClientUploadResponse upload(long actor, String id, MultipartFile file) {
        var slot = require(id, false);
        String extension = slot.platform().equals("macos") ? ".dmg" : ".exe";
        String name = validateFile(file, extension);
        String token = UUID.randomUUID().toString();
        String relative = "temporary/" + token + extension;
        Path target = resolve(relative);
        try {
            String hash = writeFile(file, target);
            long size = file.getSize();
            mapper.insert(
                    new ClientUploadEntity(
                            token, id, actor, name, relative, size, hash, ServerTime.now(clock)));
            audit.record(actor, "client_download_upload", id);
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        public void afterCompletion(int status) {
                            if (status != STATUS_COMMITTED) remove(target);
                        }
                    });
            return new ClientUploadResponse(token, name, size, hash);
        } catch (IOException | NoSuchAlgorithmException error) {
            remove(target);
            throw storage(error);
        } catch (RuntimeException error) {
            remove(target);
            throw error;
        }
    }

    @Transactional
    public ClientDownloadResponse save(long actor, String id, ClientDownloadInput input) {
        var old = require(id, true);
        String version = input.version().trim(), minimum = input.minimumOsVersion().trim();
        if (version.length() > 64 || minimum.length() > 100 || input.releaseNotes().length() > 4000)
            throw invalid("版本信息超过长度限制。");
        var upload = pendingUpload(actor, id, input.uploadId());
        String path = upload == null ? old.storagePath() : publish(old, upload);
        if (input.enabled() && (path == null || version.isEmpty() || minimum.isEmpty()))
            throw invalid("启用下载前，请填写版本号、最低系统版本并上传安装包。");
        var next = updated(old, upload, input, path);
        mapper.save(next);
        if (upload != null) mapper.deleteUpload(upload.id());
        audit.record(actor, "client_download_save", id + ":enabled=" + input.enabled());
        return response(next);
    }

    private ClientUploadEntity pendingUpload(long actor, String id, String uploadId) {
        if (uploadId == null || uploadId.isBlank()) return null;
        var upload = mapper.upload(uploadId);
        if (upload == null
                || upload.actorId() != actor
                || !upload.downloadId().equals(id)
                || upload.createdAt().isBefore(ServerTime.now(clock).minusHours(24)))
            throw invalid("临时安装包不存在或已过期，请重新上传。");
        return upload;
    }

    private String publish(ClientDownloadEntity old, ClientUploadEntity upload) {
        String extension = old.platform().equals("macos") ? ".dmg" : ".exe";
        String relative = old.id() + "/" + UUID.randomUUID() + extension;
        Path target = resolve(relative), temporary = resolve(upload.storagePath());
        try {
            Files.createDirectories(target.getParent());
            Files.copy(temporary, target);
        } catch (IOException error) {
            remove(target);
            throw storage(error);
        }
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    public void afterCompletion(int status) {
                        if (status == STATUS_COMMITTED) {
                            if (old.storagePath() != null) remove(resolve(old.storagePath()));
                            remove(temporary);
                        } else remove(target);
                    }
                });
        return relative;
    }

    private ClientDownloadEntity updated(
            ClientDownloadEntity old,
            ClientUploadEntity upload,
            ClientDownloadInput input,
            String path) {
        return new ClientDownloadEntity(
                old.id(),
                old.platform(),
                old.architecture(),
                input.version().trim(),
                upload == null ? old.originalFilename() : upload.originalFilename(),
                path,
                upload == null ? old.fileSize() : upload.fileSize(),
                upload == null ? old.sha256() : upload.sha256(),
                input.minimumOsVersion().trim(),
                input.releaseNotes(),
                input.enabled(),
                ServerTime.now(clock));
    }

    private String validateFile(MultipartFile file, String extension) {
        String name = file.getOriginalFilename();
        if (name == null
                || name.length() > 255
                || name.contains("/")
                || name.contains("\\")
                || name.chars().anyMatch(Character::isISOControl)) throw invalid("安装包文件名无效。");
        if (!name.toLowerCase(Locale.ROOT).endsWith(extension))
            throw invalid("该平台需要上传 " + extension + " 安装包。");
        if (file.isEmpty() || file.getSize() > MAX_BYTES)
            throw invalid("安装包必须大于 0 字节，且不超过 500 MB。");
        return name;
    }

    private String writeFile(MultipartFile file, Path target)
            throws IOException, NoSuchAlgorithmException {
        Files.createDirectories(target.getParent());
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        long size = 0;
        try (InputStream in = file.getInputStream();
                OutputStream out = Files.newOutputStream(target, StandardOpenOption.CREATE_NEW)) {
            byte[] buffer = new byte[65536];
            int n;
            while ((n = in.read(buffer)) != -1) {
                size += n;
                if (size > MAX_BYTES) throw invalid("安装包不能超过 500 MB。");
                digest.update(buffer, 0, n);
                out.write(buffer, 0, n);
            }
        }
        if (size != file.getSize()) throw invalid("安装包上传不完整，请重新上传。");
        return HexFormat.of().formatHex(digest.digest());
    }

    public ClientDownloadFile download(String platform, String architecture) {
        var item = require(platform + "-" + architecture, false);
        if (!item.enabled() || item.storagePath() == null) throw missing();
        if (!Files.isRegularFile(resolve(item.storagePath())))
            throw new ApiException(
                    HttpStatus.SERVICE_UNAVAILABLE, "download_file_missing", "安装包暂时不可用，请联系管理员。");
        return new ClientDownloadFile(
                "/_client_files/" + item.storagePath(),
                "Rewick-"
                        + item.platform()
                        + "-"
                        + item.architecture()
                        + (item.platform().equals("macos") ? ".dmg" : ".exe"));
    }

    @Transactional
    public void cleanup() {
        // The same row locks serialize publishing against garbage collection across instances.
        for (String id : List.of("macos-arm64", "macos-x64", "windows-x64")) require(id, true);
        mapper.expireUploads();
        Set<String> retained = new HashSet<>(mapper.retainedPaths());
        if (!Files.isDirectory(root)) return;
        try (var paths = Files.walk(root, 2)) {
            paths.filter(Files::isRegularFile)
                    .forEach(
                            file -> {
                                try {
                                    if (!retained.contains(root.relativize(file).toString())
                                            && Files.getLastModifiedTime(file)
                                                    .toInstant()
                                                    .isBefore(
                                                            clock.instant()
                                                                    .minus(Duration.ofHours(24))))
                                        remove(file);
                                } catch (IOException error) {
                                    LOG.error("Cannot inspect installer for cleanup", error);
                                }
                            });
        } catch (IOException error) {
            throw storage(error);
        }
    }

    private ClientDownloadEntity require(String id, boolean lock) {
        var item = lock ? mapper.lock(id) : mapper.find(id);
        if (item == null) throw missing();
        return item;
    }

    private ClientDownloadResponse response(ClientDownloadEntity item) {
        return new ClientDownloadResponse(
                item.id(),
                item.platform(),
                item.architecture(),
                item.version(),
                item.originalFilename(),
                item.fileSize(),
                item.sha256(),
                item.minimumOsVersion(),
                item.releaseNotes(),
                item.enabled(),
                ServerTime.instant(item.updatedAt()));
    }

    private Path resolve(String relative) {
        Path path = root.resolve(relative).normalize();
        if (!path.startsWith(root)) throw invalid("安装包路径无效。");
        return path;
    }

    private void remove(Path file) {
        try {
            Files.deleteIfExists(file);
        } catch (IOException error) {
            LOG.error("Installer cleanup failed; scheduled cleanup will retry", error);
        }
    }

    private ApiException storage(Exception error) {
        LOG.error("Installer storage operation failed", error);
        return new ApiException(
                HttpStatus.INTERNAL_SERVER_ERROR, "download_storage_failed", "安装包存储失败，请稍后重试。");
    }

    private ApiException invalid(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "invalid_download", message);
    }

    private ApiException missing() {
        return new ApiException(HttpStatus.NOT_FOUND, "download_unavailable", "该平台暂未提供下载。");
    }
}
