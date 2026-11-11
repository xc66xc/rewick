package com.interview.copilot.common.references;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import com.interview.copilot.exception.ai.ProviderFailure;
import com.interview.copilot.model.references.ReferenceRecall;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.stream.IntStream;

class ReferenceRerankInputTest {
    @Test
    void documents_duplicateChunksAndLongBodies_keepsTwoTitlesWithinCharacterAndByteBudgets() {
        var first = chunk(1, "第一节 → 标题甲\n" + "正文😀".repeat(800));
        var second = chunk(2, "第二节 → 标题乙\n" + "内容😀".repeat(800));
        var candidate = candidate(List.of(first, first, second, chunk(3, "忽略第三段")));

        String document = ReferenceRerankInput.documents("问题", List.of(candidate, candidate), "qwen3-rerank").getFirst();

        assertThat(document).contains("第一节 → 标题甲\n", "第二节 → 标题乙\n").doesNotContain("忽略第三段");
        assertThat(document.length()).isLessThanOrEqualTo(1600);
        assertThat(document.getBytes(StandardCharsets.UTF_8).length).isLessThanOrEqualTo(3500);
        assertThat(document.chars().filter(character -> Character.isHighSurrogate((char) character)).count())
                .isEqualTo(document.chars().filter(character -> Character.isLowSurrogate((char) character)).count());
    }

    @Test
    void documents_fortyCandidates_chargesRepeatedQueryAndStaysWithinGlobalBudget() {
        var candidates = IntStream.range(0, 40).mapToObj(index -> candidate(List.of(chunk(index, "内容".repeat(2000))))).toList();
        String query = "q".repeat(1900);

        var documents = ReferenceRerankInput.documents(query, candidates, "qwen3-rerank");

        assertThat(documents.stream().mapToInt(text -> text.getBytes(StandardCharsets.UTF_8).length).sum() + 40 * 1900)
                .isLessThanOrEqualTo(100000);
    }

    @Test
    void documents_queryExceedsByteLimit_skipsWithoutTruncatingQuery() {
        var candidates = List.of(candidate(List.of(chunk(1, "文本"))), candidate(List.of(chunk(2, "文本"))));

        assertThatThrownBy(() -> ReferenceRerankInput.documents("问".repeat(1167), candidates, "qwen3-rerank"))
                .isInstanceOfSatisfying(ProviderFailure.class, error -> assertThat(error.reason()).isEqualTo("input_limit"));
    }

    @Test
    void documents_repeatedQueryLeavesLessThanMinimumDocumentCapacity_skips() {
        var candidates = IntStream.range(0, 40).mapToObj(index -> candidate(List.of(chunk(index, "文本")))).toList();

        assertThatThrownBy(() -> ReferenceRerankInput.documents("q".repeat(1989), candidates, "qwen3-rerank"))
                .isInstanceOfSatisfying(ProviderFailure.class, error -> assertThat(error.reason()).isEqualTo("input_limit"));
    }

    private ReferenceCandidateEntity chunk(long id, String text) {
        return new ReferenceCandidateEntity("document", 1, id, 1, 0, text, 0.8, 0);
    }

    private ReferenceRecall.Fused candidate(List<ReferenceCandidateEntity> matches) {
        return new ReferenceRecall.Fused("document", 1, 1, 0, 1, 1, 0.8, 0.8, 0.03, matches);
    }
}
