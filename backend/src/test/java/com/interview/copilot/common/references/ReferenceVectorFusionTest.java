package com.interview.copilot.common.references;

import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.stream.LongStream;
import static org.assertj.core.api.Assertions.assertThat;

class ReferenceVectorFusionTest {
    @Test void fuse_sameQaBothRoutes_returnsOnceWithRelevantBodyAndOriginalCosine() {
        var question = hit(1,10,100,0.7);
        var body = hit(2,20,100,0.6);
        var results = ReferenceVectorFusion.fuse(List.of(question),List.of(body),60);
        assertThat(results).containsExactly(body);
        assertThat(results.getFirst().score()).isEqualTo(0.6);
    }
    @Test void fuse_questionRankHasMoreWeightThanUnrelatedBodyScore_andCapsFour() {
        var questions = LongStream.rangeClosed(1,5).mapToObj(id -> hit(id,id,id,0.5)).toList();
        var body = LongStream.rangeClosed(6,10).mapToObj(id -> hit(id,id,id,0.99)).toList();
        assertThat(ReferenceVectorFusion.fuse(questions,body,60)).containsExactlyElementsOf(questions.subList(0,4));
        assertThat(ReferenceVectorFusion.fuse(List.of(),body,60)).containsExactlyElementsOf(body.subList(0,4));
    }
    @Test void fuse_repeatedChildrenDoNotAccumulateVotes() {
        var duplicate = hit(2,20,100,0.9);
        var other = hit(3,30,200,0.8);
        var result = ReferenceVectorFusion.fuse(List.of(hit(1,10,100,0.7),duplicate,other),List.of(other),60);
        assertThat(result).hasSize(2);
        assertThat(result.getFirst().qaId()).isEqualTo(200);
    }
    private ReferenceCandidateEntity hit(long chunk, long context, long qa, double score) {
        return new ReferenceCandidateEntity("doc",1,chunk,context,(int)chunk,"answer",score,qa);
    }
}
