package com.interview.copilot.service.references;

import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.model.references.ReferenceBatchSelection;
import com.interview.copilot.model.references.ReferenceQueryPlan;
import com.interview.copilot.model.references.ReferenceRecall;

public interface ReferenceBatchRankingService {
    ReferenceBatchSelection rank(String questionId, String query, ReferenceRecall.Pair pair,
            ReferenceQueryPlan plan, OperationContext context);
    ReferenceBatchSelection fallback(String questionId, ReferenceRecall.Pair pair, ReferenceQueryPlan plan);
}
