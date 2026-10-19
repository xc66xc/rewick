package com.interview.copilot.common.references;

import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import com.interview.copilot.model.references.ReferenceRecallLimits;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Question/body weighted RRF; each route contributes once per QA/context. */
public final class ReferenceVectorFusion {
    private ReferenceVectorFusion() {}
    public static List<ReferenceCandidateEntity> fuse(List<ReferenceCandidateEntity> questions,
            List<ReferenceCandidateEntity> body, int constant) {
        Map<String, ReferenceCandidateEntity> representatives = new LinkedHashMap<>();
        Map<String, Double> scores = new LinkedHashMap<>();
        add(questions, 2, constant, representatives, scores);
        add(body, 1, constant, representatives, scores);
        return representatives.entrySet().stream().sorted(Comparator
                .<Map.Entry<String, ReferenceCandidateEntity>>comparingDouble(entry -> scores.get(entry.getKey())).reversed()
                .thenComparing(entry -> entry.getValue().documentId()).thenComparingInt(entry -> entry.getValue().ordinal())
                .thenComparingLong(entry -> entry.getValue().chunkId())).limit(ReferenceRecallLimits.BRANCH_TOP_K).map(Map.Entry::getValue).toList();
    }

    private static void add(List<ReferenceCandidateEntity> values, int weight, int constant,
            Map<String, ReferenceCandidateEntity> representatives, Map<String, Double> scores) {
        var seen = new java.util.HashSet<String>();
        for (int i = 0; i < Math.min(ReferenceRecallLimits.BRANCH_TOP_K, values.size()); i++) {
            var value = values.get(i);
            String key = value.documentId() + ":" + value.revision() + ":" + (value.qaId() > 0 ? "q" + value.qaId() : "c" + value.contextId());
            if (!seen.add(key)) continue;
            // Prefer the body hit for long-answer expansion; question-only hits use the first answer context.
            if (weight == 1) representatives.put(key, value); else representatives.putIfAbsent(key, value);
            scores.merge(key, (double) weight / (constant + i + 1), Double::sum);
        }
    }
}
