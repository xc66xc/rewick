package com.interview.copilot.converter.references;

import com.interview.copilot.entity.references.ReferenceExcerptEntity;
import com.interview.copilot.response.references.ReferenceExcerptResponse;

public final class ReferenceExcerptConverter {
    private ReferenceExcerptConverter() {}

    public static ReferenceExcerptResponse toResponse(ReferenceExcerptEntity value) {
        return new ReferenceExcerptResponse(
                value.source(),
                value.documentId(),
                value.revision(),
                value.name(),
                value.kind(),
                value.chunkId(),
                value.text(),
                value.pageStart(),
                value.pageEnd());
    }
}
