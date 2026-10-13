package com.interview.copilot.common.references;

import static org.assertj.core.api.Assertions.assertThat;
import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import org.junit.jupiter.api.Test;
import java.util.List;

class ReferenceFusionTest {
    private final ReferenceFusion fusion = new ReferenceFusion();
    @Test void fuse_sameDocumentContext_accumulatesBothRanksOnce() {
        var bm25 = List.of(hit(1,10),hit(2,20),hit(3,20));
        var vector = List.of(hit(4,20),hit(5,30),hit(6,10));
        var result = fusion.fuse(bm25,vector,60);
        assertThat(result).hasSize(3);
        var first = result.getFirst();
        assertThat(first.contextId()).isEqualTo(20);
        assertThat(first.bm25Rank()).isEqualTo(2);
        assertThat(first.vectorRank()).isEqualTo(1);
        assertThat(first.rrfScore()).isCloseTo(1.0/62+1.0/61, org.assertj.core.data.Offset.offset(1e-12));
        assertThat(result.stream().map(c -> c.contextId()).distinct().count()).isEqualTo(3);
    }
    @Test void fuse_singleBranchCapsAtThree_andDoesNotInventResults() {
        var result = fusion.fuse(List.of(hit(1,10),hit(2,20),hit(3,30),hit(4,40),hit(5,50),hit(6,60)),List.of(),60);
        assertThat(result).extracting(c -> c.contextId()).containsExactly(10L,20L,30L);
        assertThat(fusion.fuse(List.of(hit(1,10)),List.of(),60)).hasSize(1);
    }
    @Test void fuse_differentContextsInSameDocument_notDeduplicatedByFile() {
        assertThat(fusion.fuse(List.of(hit(1,10),hit(2,20)),List.of(hit(3,30)),60)).hasSize(3);
    }
    private ReferenceCandidateEntity hit(long chunk, long parent) {
        return new ReferenceCandidateEntity("same-document",1,chunk,parent,(int)chunk,"正文",99);
    }
}
