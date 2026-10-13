package com.interview.copilot.service.references;

import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.entity.references.ReferenceScopeEntity;
import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import com.interview.copilot.model.operations.OperationContext;
import java.util.List;

public interface ReferenceRecallService {
    List<ReferenceCandidateEntity> bm25(long user, List<ReferenceScopeEntity> scope, String query, ReferencePolicy policy);
    List<ReferenceCandidateEntity> vector(long user, List<ReferenceScopeEntity> scope, String query, ReferencePolicy policy, OperationContext context);
}
