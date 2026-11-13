package com.interview.copilot.service.references;

import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.request.references.SearchReferenceBatchRequest;
import com.interview.copilot.response.references.ReferenceBatchRetrievalResponse;

public interface ReferenceBatchRetrievalService {
    ReferenceBatchRetrievalResponse retrieve(long user, SearchReferenceBatchRequest input, OperationContext context);
}
