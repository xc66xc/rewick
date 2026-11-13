package com.interview.copilot.service.references;

import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.request.references.SearchReferenceBatchRequest;
import com.interview.copilot.response.references.ReferenceBatchRetrievalResponse;

public interface ReferenceBatchSearchService {
    ReferenceBatchRetrievalResponse search(long user, long token, String requestId,
            SearchReferenceBatchRequest input, OperationContext context);
}
