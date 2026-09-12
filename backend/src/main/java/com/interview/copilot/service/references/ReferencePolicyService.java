package com.interview.copilot.service.references;

import com.interview.copilot.request.references.ReferencePolicyRequest;
import com.interview.copilot.response.references.ReferencePolicyResponse;

public interface ReferencePolicyService {
    ReferencePolicyResponse get();

    void update(ReferencePolicyRequest policy);
}
