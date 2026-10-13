package com.interview.copilot.service.references;

import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.entity.references.ReferenceScopeEntity;
import com.interview.copilot.model.references.ReferenceRecall;
import com.interview.copilot.model.operations.OperationContext;
import java.util.List;

public interface ReferenceParallelService {
    ReferenceRecall.Pair recall(long user, List<ReferenceScopeEntity> scope, String query,
            ReferencePolicy policy, OperationContext context);
}
