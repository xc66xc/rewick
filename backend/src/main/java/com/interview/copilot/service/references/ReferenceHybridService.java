package com.interview.copilot.service.references;

import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.response.references.ReferenceRetrievalResponse;
import java.util.List;

public interface ReferenceHybridService {
    ReferenceRetrievalResponse retrieve(long user, String query, List<String> ids, OperationContext observation);
}
