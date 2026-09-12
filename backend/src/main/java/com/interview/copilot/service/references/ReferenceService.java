package com.interview.copilot.service.references;

import com.interview.copilot.response.references.ReferenceDocumentResponse;
import com.interview.copilot.response.references.ReferencePreviewResponse;

import org.springframework.web.multipart.MultipartFile;

import java.util.List;

public interface ReferenceService {
    List<ReferenceDocumentResponse> list(long user);

    ReferenceDocumentResponse upload(long user, MultipartFile file);

    ReferencePreviewResponse preview(long user, String id);

    void update(long user, String id, Boolean enabled, String kind);

    void reindex(long user, String id);

    void delete(long user, String id);
}
