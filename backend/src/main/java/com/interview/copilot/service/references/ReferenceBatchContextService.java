package com.interview.copilot.service.references;

import com.interview.copilot.entity.references.ReferenceScopeEntity;
import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.model.references.ReferenceBatchSelection;
import com.interview.copilot.model.references.ReferenceQueryPlan;
import com.interview.copilot.response.references.ReferenceBatchRetrievalResponse;
import java.util.List;

public interface ReferenceBatchContextService {
    ReferenceBatchRetrievalResponse pack(long user, List<ReferenceScopeEntity> scope,
            List<ReferenceBatchSelection> selections, ReferenceQueryPlan plan, OperationContext context);
}
