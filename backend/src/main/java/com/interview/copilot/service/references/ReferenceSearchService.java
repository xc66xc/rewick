package com.interview.copilot.service.references;

import com.interview.copilot.response.references.ReferenceRetrievalResponse;

import java.util.List;
import java.util.UUID;

public interface ReferenceSearchService {
    ReferenceRetrievalResponse search(long user, String requestId, String query, List<UUID> ids);
    default ReferenceRetrievalResponse search(long user,String requestId,String query,List<UUID> ids,com.interview.copilot.model.operations.OperationContext context) {return search(user,requestId,query,ids);}
}
