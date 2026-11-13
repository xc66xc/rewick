package com.interview.copilot.request.references;

import java.util.List;
import java.util.UUID;

public record SearchReferenceBatchRequest(List<Query> queries, List<UUID> referenceIds) {
    public SearchReferenceBatchRequest {
        if (queries != null) queries = java.util.Collections.unmodifiableList(new java.util.ArrayList<>(queries));
        if (referenceIds != null) referenceIds = java.util.Collections.unmodifiableList(new java.util.ArrayList<>(referenceIds));
    }
    public record Query(String questionId, String query) {}
}
