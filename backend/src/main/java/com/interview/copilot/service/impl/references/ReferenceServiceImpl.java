package com.interview.copilot.service.impl.references;

import com.interview.copilot.common.references.PlatformEmbeddingClient;
import com.interview.copilot.common.references.ReferenceFiles;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.exception.references.ReferenceErrors;
import com.interview.copilot.response.references.ReferenceDocumentResponse;
import com.interview.copilot.response.references.ReferencePreviewResponse;
import com.interview.copilot.service.references.ReferenceService;
import com.interview.copilot.service.references.ReferenceStorageService;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@Service
public class ReferenceServiceImpl implements ReferenceService {
    private static final Logger LOG = LoggerFactory.getLogger(ReferenceServiceImpl.class);
    private final ReferenceStorageService repository;
    private final ReferenceFiles files;
    private final PlatformEmbeddingClient embedding;

    public ReferenceServiceImpl(
            ReferenceStorageService repository,
            ReferenceFiles files,
            PlatformEmbeddingClient embedding) {
        this.repository = repository;
        this.files = files;
        this.embedding = embedding;
    }

    public List<ReferenceDocumentResponse> list(long user) {
        return repository.list(user);
    }

    public ReferenceDocumentResponse upload(long user, MultipartFile file) {
        String name = files.name(file);
        embedding.selection();
        String id = UUID.randomUUID().toString();
        try {
            String hash = files.save(id, file);
            repository.insert(user, id, name, hash, file.getSize());
            return repository.require(user, id);
        } catch (IOException error) {
            cleanup(id);
            LOG.error("Reference upload failed user={}", user, error);
            throw new ApiException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "reference_upload_failed", "资料上传失败，请重试。");
        } catch (DuplicateKeyException error) {
            cleanup(id);
            throw ReferenceErrors.invalid("已经上传过相同的资料。");
        } catch (RuntimeException error) {
            cleanup(id);
            throw error;
        }
    }

    public ReferencePreviewResponse preview(long user, String id) {
        return new ReferencePreviewResponse(
                repository.require(user, id), repository.preview(user, id));
    }

    public void update(long user, String id, Boolean enabled, String kind) {
        repository.update(user, id, enabled, kind);
    }

    public void reindex(long user, String id) {
        var document = repository.require(user, id);
        if (!document.name().toLowerCase(java.util.Locale.ROOT).matches(".*\\.(md|doc|docx)$")) throw ReferenceErrors.invalid("参考资料只支持 Markdown 和 Word，请重新上传。");
        embedding.selection();
        repository.reindex(user, id);
    }

    public void delete(long user, String id) {
        repository.delete(user, id);
        cleanup(id);
    }

    private void cleanup(String id) {
        try {
            files.delete(id);
        } catch (IOException error) {
            LOG.error("Cannot remove reference file id={}", id, error);
        }
    }
}
