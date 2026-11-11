package com.interview.copilot.service.references;

import com.interview.copilot.model.references.ReferenceQueryPlan;

public interface ReferenceQueryService {
    ReferenceQueryPlan prepare();
    java.util.List<com.interview.copilot.entity.references.ReferenceScopeEntity> scope(
            long user, java.util.List<String> ids, ReferenceQueryPlan plan);
}
