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
        assertThat(result).hasSize(2);
        var first = result.getFirst();
        assertThat(first.contextId()).isEqualTo(20);
        assertThat(first.bm25Rank()).isEqualTo(2);
        assertThat(first.vectorRank()).isEqualTo(1);
        assertThat(first.rrfScore()).isCloseTo(1.0/62+1.0/61, org.assertj.core.data.Offset.offset(1e-12));
        assertThat(result.stream().map(c -> c.contextId()).distinct().count()).isEqualTo(2);
    }
    @Test void fuse_singleBranchCapsAtTwo_andDoesNotInventResults() {
        var result = fusion.fuse(List.of(hit(1,10),hit(2,20),hit(3,30),hit(4,40),hit(5,50),hit(6,60)),List.of(),60);
        assertThat(result).extracting(c -> c.contextId()).containsExactly(10L,20L);
        assertThat(fusion.fuse(List.of(hit(1,10)),List.of(),60)).hasSize(1);
    }
    @Test void fuse_differentContextsInSameDocument_notDeduplicatedByFile() {
        assertThat(fusion.fuse(List.of(hit(1,10),hit(2,20)),List.of(hit(3,30)),60)).extracting(c -> c.contextId()).containsExactly(10L,30L);
    }
    @Test void fuse_differentAnswerContextsOfOneQuestion_returnsOneQa() {
        var lexical = new ReferenceCandidateEntity("doc",1,1,10,0,"答案开头",0.9,100);
        var vector = new ReferenceCandidateEntity("doc",1,2,20,1,"答案后半",0.8,100);
        var result = fusion.fuse(List.of(lexical),List.of(vector),60);
        assertThat(result).hasSize(1);
        assertThat(result.getFirst().matches()).containsExactly(lexical,vector);
        assertThat(result.getFirst().rrfScore()).isCloseTo(2.0/61,org.assertj.core.data.Offset.offset(1e-12));
    }
    @Test void fuse_fifthCandidateDoesNotContributeRankOrMatches() {
        var fifth = hit(5,50);
        var result = fusion.fuse(List.of(hit(1,10),hit(2,20),hit(3,30),hit(4,40),fifth),List.of(fifth),60);
        var match = result.stream().filter(row -> row.contextId() == 50).findFirst().orElseThrow();
        assertThat(match.bm25Rank()).isNull();
        assertThat(match.vectorRank()).isEqualTo(1);
        assertThat(match.matches()).containsExactly(fifth);
        assertThat(match.rrfScore()).isEqualTo(1.0/61);
    }
    private ReferenceCandidateEntity hit(long chunk, long parent) {
        return new ReferenceCandidateEntity("same-document",1,chunk,parent,(int)chunk,"正文",99,0);
    }
}
