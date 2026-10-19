package com.interview.copilot.service.references;

import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import com.interview.copilot.entity.references.ReferenceScopeEntity;
import java.util.List;

public interface ReferenceVectorService {
    List<ReferenceCandidateEntity> search(long user, List<ReferenceScopeEntity> scope,
            String vector, String fingerprint, ReferencePolicy policy);
}
