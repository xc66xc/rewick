package com.interview.copilot.service.references;

import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.model.platform.PlatformSnapshot;
import com.interview.copilot.model.references.ReferenceRecall;
import com.interview.copilot.model.references.ReferenceRerank;

import java.util.List;

public interface ReferenceRerankService {
    ReferenceRerank.Result rank(String query, List<ReferenceRecall.Fused> candidates,
            PlatformSnapshot snapshot, long deadlineNanos, OperationContext observation);
}
