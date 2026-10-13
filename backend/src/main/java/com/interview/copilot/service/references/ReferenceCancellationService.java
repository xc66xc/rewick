package com.interview.copilot.service.references;

import com.interview.copilot.common.references.ReferenceWork;
public interface ReferenceCancellationService {
    ReferenceWork register(long user, String requestId);
    void cancel(long user, String requestId);
}
