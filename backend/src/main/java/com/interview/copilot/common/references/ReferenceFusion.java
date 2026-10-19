package com.interview.copilot.common.references;

import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import com.interview.copilot.model.references.ReferenceRecallLimits;
import com.interview.copilot.model.references.ReferenceRecall.Fused;
import org.springframework.stereotype.Component;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Equal-weight RRF over unique QA units (ordinary documents use contexts); original child ranks remain unchanged. */
@Component
public class ReferenceFusion {
    public List<Fused> fuse(List<ReferenceCandidateEntity> bm25, List<ReferenceCandidateEntity> vector, int constant) {
        if (constant < 1) throw new IllegalArgumentException("RRF constant must be positive");
        var lexical = best(bm25);
        var semantic = best(vector);
        var union = new java.util.LinkedHashSet<>(lexical.keySet());
        union.addAll(semantic.keySet());
        List<Fused> results = new ArrayList<>();
        for (String key : union) {
            var a = lexical.get(key);
            var b = semantic.get(key);
            var child = b != null && b.child().qaId() > 0 ? b.child() : a == null ? b.child() : a.child();
            List<ReferenceCandidateEntity> matches = java.util.stream.Stream.concat(bm25.stream().limit(ReferenceRecallLimits.BRANCH_TOP_K), vector.stream().limit(ReferenceRecallLimits.BRANCH_TOP_K))
                    .filter(row -> key(row).equals(key)).distinct().toList();
            results.add(new Fused(child.documentId(), child.revision(), child.contextId(), child.ordinal(),
                    a == null ? null : a.rank(), b == null ? null : b.rank(),
                    a == null ? null : a.child().score(), b == null ? null : b.child().score(),
                    (a == null ? 0 : 1.0 / (constant + a.rank())) + (b == null ? 0 : 1.0 / (constant + b.rank())), matches));
        }
        return results.stream().sorted(Comparator.comparingDouble(Fused::rrfScore).reversed()
                .thenComparingInt(f -> Math.min(rank(f.bm25Rank()), rank(f.vectorRank())))
                .thenComparingInt(f -> rank(f.bm25Rank()) + rank(f.vectorRank()))
                .thenComparing(Fused::documentId).thenComparingInt(Fused::ordinal).thenComparingLong(Fused::contextId)).limit(ReferenceRecallLimits.FINAL_TOP_K).toList();
    }
    private Map<String, Ranked> best(List<ReferenceCandidateEntity> input) {
        Map<String, Ranked> ranks = new LinkedHashMap<>();
        for (int i = 0; i < Math.min(ReferenceRecallLimits.BRANCH_TOP_K, input.size()); i++) {
            var child = input.get(i);
            ranks.putIfAbsent(key(child), new Ranked(i + 1, child));
        }
        return ranks;
    }
    private String key(ReferenceCandidateEntity row) { return row.documentId() + ":" + row.revision() + ":" + (row.qaId() > 0 ? "q" + row.qaId() : "c" + row.contextId()); }
    private int rank(Integer value) { return value == null ? ReferenceRecallLimits.BRANCH_TOP_K + 1 : value; }
    private record Ranked(int rank, ReferenceCandidateEntity child) {}
}
