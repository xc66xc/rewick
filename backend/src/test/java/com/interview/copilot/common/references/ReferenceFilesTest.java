package com.interview.copilot.common.references;

import static org.assertj.core.api.Assertions.*;

import com.interview.copilot.exception.ApiException;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.file.Path;
import java.util.UUID;

public class ReferenceFilesTest {
    @TempDir Path directory;

    @ParameterizedTest
    @ValueSource(strings = {"../escape.md", "secret.exe", "folder/name.docx"})
    void name_unsupportedOrTraversal_rejects(String name) {
        assertThatThrownBy(
                        () ->
                                new ReferenceFiles(directory.toString())
                                        .name(
                                                new MockMultipartFile(
                                                        "file",
                                                        name,
                                                        "text/plain",
                                                        new byte[] {1})))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void name_oversizeFile_rejects() {
        assertThatThrownBy(
                        () ->
                                new ReferenceFiles(directory.toString())
                                        .name(
                                                new MockMultipartFile(
                                                        "file",
                                                        "large.md",
                                                        "text/plain",
                                                        new byte[10 * 1024 * 1024 + 1])))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void save_validContent_persistsByUuidWithDigest() throws Exception {
        var files = new ReferenceFiles(directory.toString());
        String id = UUID.randomUUID().toString();
        String hash =
                files.save(
                        id,
                        new MockMultipartFile(
                                "file", "small.md", "text/plain", "sample".getBytes()));
        assertThat(hash).hasSize(64);
        assertThat(files.path(id)).hasContent("sample");
        files.delete(id);
        assertThat(files.path(id)).doesNotExist();
    }
}
