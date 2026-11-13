package com.interview.copilot.validation.references;

import com.interview.copilot.exception.ApiException;
import com.interview.copilot.request.references.SearchReferenceBatchRequest;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReferenceBatchPolicyTest {
    @Test
    void request_duplicateQuestionsOrOversizedQuery_rejectsBeforeRetrieval() {
        var query = new SearchReferenceBatchRequest.Query("q1", "question");
        assertThatThrownBy(() -> ReferenceBatchPolicy.request(new SearchReferenceBatchRequest(List.of(query, query), List.of())))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> ReferenceBatchPolicy.request(new SearchReferenceBatchRequest(
                List.of(new SearchReferenceBatchRequest.Query("q1", "😀".repeat(601))), List.of())))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void request_unicodeBoundaryAndEmptyReferences_acceptsWhileMalformedIdRejects() {
        assertThatCode(() -> ReferenceBatchPolicy.request(new SearchReferenceBatchRequest(
                List.of(new SearchReferenceBatchRequest.Query("q1", "😀".repeat(600))), List.of(UUID.randomUUID()))))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> ReferenceBatchPolicy.requestId("not-an-id")).isInstanceOf(ApiException.class);
    }
}
