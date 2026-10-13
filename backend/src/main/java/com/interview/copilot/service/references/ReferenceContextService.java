package com.interview.copilot.service.references;

import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.entity.references.ReferenceScopeEntity;
import com.interview.copilot.model.references.ReferenceRecall;
import com.interview.copilot.response.references.ReferenceExcerptResponse;
import com.interview.copilot.model.operations.OperationContext;
import java.util.List;

public interface ReferenceContextService {
    void invalidate(long user, String document);
    List<ReferenceExcerptResponse> expand(long user, List<ReferenceScopeEntity> scope,
            List<ReferenceRecall.Fused> fused, ReferencePolicy policy, OperationContext observation);
}
