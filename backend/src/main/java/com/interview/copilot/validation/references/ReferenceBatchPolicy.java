package com.interview.copilot.validation.references;

import com.interview.copilot.exception.references.ReferenceErrors;
import com.interview.copilot.request.references.SearchReferenceBatchRequest;
import java.util.HashSet;
import java.util.UUID;

public final class ReferenceBatchPolicy {
    private ReferenceBatchPolicy() {}

    public static void request(SearchReferenceBatchRequest input) {
        if (input == null || input.queries() == null || input.queries().isEmpty()
                || input.queries().size() > 5 || input.referenceIds() == null
                || input.referenceIds().size() > 100 || input.referenceIds().stream().anyMatch(java.util.Objects::isNull)) throw invalid();
        var identifiers = new HashSet<String>();
        int total = 0;
        for (var query : input.queries()) {
            if (query == null || query.questionId() == null || !query.questionId().matches("q[1-5]")
                    || !identifiers.add(query.questionId()) || query.query() == null
                    || query.query().isBlank() || characters(query.query()) > 600) throw invalid();
            total += characters(query.query());
        }
        if (total > 1500) throw invalid();
    }

    public static String requestId(String value) {
        try {
            if (value == null || !UUID.fromString(value).toString().equalsIgnoreCase(value)) throw invalid();
            return value.toLowerCase(java.util.Locale.ROOT);
        } catch (IllegalArgumentException error) {
            throw invalid();
        }
    }

    private static int characters(String value) { return value.codePointCount(0, value.length()); }
    private static com.interview.copilot.exception.ApiException invalid() {
        return ReferenceErrors.invalid("资料批次必须包含1至5个唯一问题，每题最多600字符，合计最多1500字符。");
    }
}
