package com.interview.copilot.service.references;

import com.interview.copilot.response.references.ReferenceDocumentResponse;

import java.util.List;

public interface ReferenceStorageService {
    List<ReferenceDocumentResponse> list(long user);

    ReferenceDocumentResponse require(long user, String id);

    void requireAll(long user, List<String> ids);

    void lockUser(long user);

    void insert(long user, String id, String name, String hash, long size);

    void reindex(long user, String id);

    void update(long user, String id, Boolean enabled, String kind);

    void delete(long user, String id);

    String preview(long user, String id);
}
