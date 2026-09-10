package com.interview.copilot.references;

import com.interview.copilot.common.ApiException;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockMultipartFile;
import static org.assertj.core.api.Assertions.*;
class ReferenceFilesTest {
    @TempDir Path directory;
    @ParameterizedTest @ValueSource(strings={"../escape.txt","secret.exe","folder/name.pdf"})
    void name_unsupportedOrTraversal_rejects(String name) {
        assertThatThrownBy(() -> new ReferenceFiles(directory.toString()).name(new MockMultipartFile("file",name,"text/plain",new byte[]{1})))
                .isInstanceOf(ApiException.class);
    }
    @Test void name_oversizeFile_rejects() {
        assertThatThrownBy(() -> new ReferenceFiles(directory.toString()).name(new MockMultipartFile("file","large.txt","text/plain",new byte[10*1024*1024+1])))
                .isInstanceOf(ApiException.class);
    }
    @Test void save_validContent_persistsByUuidWithDigest() throws Exception {
        var files=new ReferenceFiles(directory.toString()); String id=UUID.randomUUID().toString();
        String hash=files.save(id,new MockMultipartFile("file","small.txt","text/plain","sample".getBytes()));
        assertThat(hash).hasSize(64);
        assertThat(files.path(id)).hasContent("sample");
        files.delete(id); assertThat(files.path(id)).doesNotExist();
    }
}
