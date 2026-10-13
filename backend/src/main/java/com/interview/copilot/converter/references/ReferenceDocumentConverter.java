package com.interview.copilot.converter.references;

import com.interview.copilot.entity.references.ReferenceDocumentEntity;
import com.interview.copilot.response.references.ReferenceDocumentResponse;

public final class ReferenceDocumentConverter {
    private ReferenceDocumentConverter() {}

    public static ReferenceDocumentResponse toResponse(ReferenceDocumentEntity value) {
        return new ReferenceDocumentResponse(
                value.id(),
                value.name(),
                value.kind(),
                value.enabled(),
                value.status(),
                value.contentHash(),
                value.revision(),
                value.createdAt(),
                value.updatedAt(),
                value.error(),
                value.chunkCount(), value.contextCount(), value.sectionCount(), value.format(), value.headingMode(), value.splitterVersion(), value.indexStatus(), value.indexError());
    }
}
