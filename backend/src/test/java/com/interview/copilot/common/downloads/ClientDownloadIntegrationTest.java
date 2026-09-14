package com.interview.copilot.common.downloads;

import static org.assertj.core.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.common.email.EmailAuthTestDatabase;
import com.interview.copilot.dto.downloads.ClientDownloadInput;
import com.interview.copilot.service.downloads.ClientDownloadService;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.util.LinkedMultiValueMap;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.util.Comparator;
import java.util.Map;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 安装包权限、持久化与替换事务验证。
 */
@Tag("integration")
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "copilot.auth.admin.bootstrap-username=download-admin",
            "copilot.auth.admin.bootstrap-password=download-test-password-123",
            "copilot.auth.login-burst=1000"
        })
class ClientDownloadIntegrationTest {
    @Container static final EmailAuthTestDatabase DB = new EmailAuthTestDatabase();
    static final Path ROOT = temp();
    @Autowired TestRestTemplate http;
    @Autowired JdbcTemplate jdbc;
    @Autowired ClientDownloadService service;
    String token;
    long actor;

    static Path temp() {
        try {
            return Files.createTempDirectory("download-integration-");
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", DB::getJdbcUrl);
        r.add("spring.datasource.username", DB::getUsername);
        r.add("spring.datasource.password", DB::getPassword);
        r.add("copilot.downloads.directory", ROOT::toString);
    }

    @BeforeEach
    void setup() throws Exception {
        jdbc.execute("ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS reject_download_save");
        jdbc.update("DELETE FROM client_download_uploads");
        jdbc.update(
                "UPDATE client_downloads SET"
                    + " storage_path=NULL,enabled=false,version='',original_filename='',file_size=0,sha256='',minimum_os_version='',release_notes=''");
        try (var paths = Files.walk(ROOT)) {
            for (Path file : paths.filter(Files::isRegularFile).toList()) Files.delete(file);
        }
        var result =
                http.postForEntity(
                        "/api/v1/auth/login",
                        Map.of(
                                "identifier",
                                "download-admin",
                                "password",
                                "download-test-password-123",
                                "clientType",
                                "admin"),
                        JsonNode.class);
        assertThat(result.getStatusCode()).isEqualTo(HttpStatus.OK);
        token = result.getBody().path("accessToken").asText();
        actor = Long.parseLong(result.getBody().path("user").path("id").asText());
    }

    @AfterAll
    static void removeFiles() throws Exception {
        try (var paths = Files.walk(ROOT)) {
            for (Path file : paths.sorted(Comparator.reverseOrder()).toList())
                Files.deleteIfExists(file);
        }
    }

    ClientDownloadInput input(String upload) {
        return new ClientDownloadInput("0.5.0", "macOS 12+", "更新说明", true, upload);
    }

    String upload(String name, String value) {
        return service.upload(
                        actor,
                        "macos-arm64",
                        new MockMultipartFile(
                                "file", name, "application/octet-stream", value.getBytes()))
                .uploadId();
    }

    Path current() {
        return ROOT.resolve(
                jdbc.queryForObject(
                        "SELECT storage_path FROM client_downloads WHERE id='macos-arm64'",
                        String.class));
    }

    @Test
    void publicCatalogAndAdminUploadRespectAccessBoundary() {
        var list = http.getForEntity("/api/v1/client-downloads", String.class);
        assertThat(list.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(list.getBody()).doesNotContain("storagePath", "actorId");
        assertThat(
                        http.getForEntity("/api/v1/admin/client-downloads", String.class)
                                .getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(http.getForEntity("/downloads/macos/arm64", String.class).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        var body = new LinkedMultiValueMap<String, Object>();
        body.add(
                "file",
                new ByteArrayResource("package-bytes".getBytes()) {
                    public String getFilename() {
                        return "Rewick.dmg";
                    }
                });
        var headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        assertThat(
                        http.postForEntity(
                                        "/api/v1/admin/client-downloads/macos-arm64/upload",
                                        new HttpEntity<>(body, headers),
                                        String.class)
                                .getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        headers.setBearerAuth(token);
        var uploaded =
                http.postForEntity(
                        "/api/v1/admin/client-downloads/macos-arm64/upload",
                        new HttpEntity<>(body, headers),
                        JsonNode.class);
        assertThat(uploaded.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(uploaded.getBody().path("fileSize").asLong()).isEqualTo(13);
        headers.setContentType(MediaType.APPLICATION_JSON);
        var saved =
                http.exchange(
                        "/api/v1/admin/client-downloads/macos-arm64",
                        HttpMethod.PUT,
                        new HttpEntity<>(
                                Map.of(
                                        "version",
                                        "0.5.0",
                                        "minimumOsVersion",
                                        "macOS 12+",
                                        "releaseNotes",
                                        "",
                                        "enabled",
                                        true,
                                        "uploadId",
                                        uploaded.getBody().path("uploadId").asText()),
                                headers),
                        JsonNode.class);
        assertThat(saved.getStatusCode()).isEqualTo(HttpStatus.OK);
        var download = http.getForEntity("/downloads/macos/arm64", String.class);
        assertThat(download.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(download.getHeaders().getFirst("X-Accel-Redirect"))
                .startsWith("/_client_files/macos-arm64/");
    }

    @Test
    void replacingFileDeletesOldPackageAndKeepsOnlyLatest() throws Exception {
        service.save(actor, "macos-arm64", input(upload("old.dmg", "old")));
        Path old = current();
        service.save(actor, "macos-arm64", input(upload("new.dmg", "new-package")));
        assertThat(Files.exists(old)).isFalse();
        assertThat(Files.readString(current())).isEqualTo("new-package");
        assertThat(
                        jdbc.queryForObject(
                                "SELECT count(*) FROM client_download_uploads", Integer.class))
                .isZero();
        service.save(
                actor,
                "macos-arm64",
                new ClientDownloadInput("0.5.0", "macOS 12+", "", false, null));
        assertThat(http.getForEntity("/downloads/macos/arm64", String.class).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void failedSaveRollsBackMetadataAndPreservesOriginalAndTemporaryFile() throws Exception {
        service.save(actor, "macos-arm64", input(upload("old.dmg", "old")));
        Path old = current();
        String next = upload("new.dmg", "new");
        jdbc.execute(
                "ALTER TABLE audit_events ADD CONSTRAINT reject_download_save"
                        + " CHECK(action<>'client_download_save') NOT VALID");
        assertThatThrownBy(() -> service.save(actor, "macos-arm64", input(next)))
                .isInstanceOf(RuntimeException.class);
        assertThat(current()).isEqualTo(old);
        assertThat(Files.readString(old)).isEqualTo("old");
        assertThat(
                        jdbc.queryForObject(
                                "SELECT count(*) FROM client_download_uploads WHERE id=?",
                                Integer.class,
                                next))
                .isEqualTo(1);
        jdbc.execute("ALTER TABLE audit_events DROP CONSTRAINT reject_download_save");
        service.save(actor, "macos-arm64", input(next));
        assertThat(Files.readString(current())).isEqualTo("new");
    }

    @Test
    void invalidFileAndExpiredOrForeignUploadCannotReplaceCurrent() {
        assertThatThrownBy(() -> upload("wrong.exe", "bytes")).hasMessageContaining(".dmg");
        assertThatThrownBy(() -> upload("../bad.dmg", "bytes")).hasMessageContaining("文件名");
        assertThatThrownBy(() -> upload("empty.dmg", "")).hasMessageContaining("0 字节");
        String id = upload("file.dmg", "bytes");
        assertThatThrownBy(() -> service.save(actor + 1, "macos-arm64", input(id)))
                .hasMessageContaining("临时安装包");
        assertThatThrownBy(() -> service.save(actor, "macos-x64", input(id)))
                .hasMessageContaining("临时安装包");
        jdbc.update("UPDATE client_download_uploads SET created_at=created_at-interval '25 hours'");
        assertThatThrownBy(() -> service.save(actor, "macos-arm64", input(id)))
                .hasMessageContaining("过期");
    }

    @Test
    void cleanupDeletesAbandonedFilesButRetainsPublishedPackage() throws Exception {
        service.save(actor, "macos-arm64", input(upload("current.dmg", "current")));
        Path published = current();
        String abandoned = upload("abandoned.dmg", "abandoned");
        Path pending =
                ROOT.resolve(
                        jdbc.queryForObject(
                                "SELECT storage_path FROM client_download_uploads WHERE id=?",
                                String.class,
                                abandoned));
        Files.setLastModifiedTime(published, FileTime.from(Instant.now().minusSeconds(90000)));
        Files.setLastModifiedTime(pending, FileTime.from(Instant.now().minusSeconds(90000)));
        jdbc.update("UPDATE client_download_uploads SET created_at=created_at-interval '25 hours'");
        service.cleanup();
        assertThat(Files.exists(published)).isTrue();
        assertThat(Files.exists(pending)).isFalse();
    }

    @Test
    void enablingWithoutPackageFails() {
        assertThatThrownBy(() -> service.save(actor, "windows-x64", input(null)))
                .hasMessageContaining("上传安装包");
    }
}
