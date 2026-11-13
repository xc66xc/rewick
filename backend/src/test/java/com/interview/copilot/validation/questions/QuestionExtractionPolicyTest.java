package com.interview.copilot.validation.questions;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.exception.questions.QuestionRewriteOutputException;
import com.interview.copilot.request.questions.QuestionRewriteRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.util.List;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class QuestionExtractionPolicyTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void output_independentAsks_removesUnrelatedBackgroundAndAssignsOrderedIds() {
        var input = input("前面讲到 Reactor 构建。除了 ReAct，还有哪些 Agent 模式？什么是 SSE？MCP 除 SSE 外有哪些传输方式？");
        var result = extract(input, List.of(item("除了 ReAct，还有哪些 Agent 模式？"), item("什么是 SSE？"), item("MCP 除 SSE 外有哪些传输方式？")));

        assertThat(result).extracting(q -> q.id()).containsExactly("q1", "q2", "q3");
        assertThat(result).extracting(q -> q.question()).allSatisfy(value -> assertThat(value).doesNotContain("Reactor"));
    }

    @Test
    void output_currentAnchorAndExplicitContext_resolvesOnlyTheReferencedEntity() {
        var input = new QuestionRewriteRequest("它有什么限制？", List.of("这里提到 Redis。"), "questions-v1");
        var question = Map.of("question", "Redis 有什么限制？", "sourceTexts", List.of("它有什么限制？"),
                "contextSourceTexts", List.of("这里提到 Redis。"));

        assertThat(extract(input, List.of(question))).singleElement().satisfies(q -> {
            assertThat(q.sourceTexts()).containsExactly("它有什么限制？");
            assertThat(q.contextSourceTexts()).containsExactly("这里提到 Redis。");
        });
    }

    @Test
    void output_backgroundInsideSameSentence_doesNotForceBackgroundEntityIntoQuery() {
        var result = extract(input("看到你用 Reactor 构建了这个系统，那么什么是 SSE？"), List.of(item("什么是 SSE？")));
        assertThat(result).singleElement().satisfies(question -> assertThat(question.question()).isEqualTo("什么是 SSE？"));
    }

    @Test
    void output_parallelAsksInsideOneSentence_rejectsMissingSecondAsk() {
        var input = input("什么是 SSE，以及 MCP 支持哪些传输方式？");
        var firstOnly = Map.of("question", "SSE 是什么？", "sourceTexts", List.of("什么是 SSE"));
        assertThatThrownBy(() -> extract(input, List.of(firstOnly))).isInstanceOf(QuestionRewriteOutputException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"以及", "还有", "另外一个"})
    void output_parallelAsksInsideOneSentence_acceptsCompleteIndependentQueries(String conjunction) {
        var input = input("什么是 SSE，" + conjunction + " MCP 支持哪些传输方式？");
        var first = Map.of("question", "SSE 是什么？", "sourceTexts", List.of("什么是 SSE"));
        var second = Map.of("question", "MCP 支持哪些传输方式？", "sourceTexts", List.of("MCP 支持哪些传输方式？"));
        assertThat(extract(input, List.of(first, second))).hasSize(2);
    }

    @Test
    void output_fragmentedSourcesCannotHideNumbersBetweenQuotedPieces() {
        var input = input("Redis 超时 30毫秒怎么处理？SSE 超时 60毫秒怎么处理？");
        var first = Map.of("question", "Redis 如何处理？", "sourceTexts", List.of("Redis", "怎么处理？"));
        var second = Map.of("question", "SSE 如何处理？", "sourceTexts", List.of("SSE", "怎么处理？"));
        assertThatThrownBy(() -> extract(input, List.of(first, second))).isInstanceOf(QuestionRewriteOutputException.class);
    }

    @Test
    void output_completeFragmentedSourcesWithNumbers_acceptsRatherThanRequiringOneLongQuote() {
        var input = input("Redis 超时 30毫秒怎么处理？SSE 超时 60毫秒怎么处理？");
        var first = Map.of("question", "Redis 超时 30毫秒如何处理？", "sourceTexts", List.of("Redis", "超时 30毫秒", "怎么处理？"));
        var second = Map.of("question", "SSE 超时 60毫秒如何处理？", "sourceTexts", List.of("SSE", "超时 60毫秒", "怎么处理？"));
        assertThat(extract(input, List.of(first, second))).hasSize(2);
    }

    @Test
    void output_explicitBackgroundVersionInsideSentence_canBeRemoved() {
        var input = input("我看到你用 Reactor 3 构建了服务，那么什么是 SSE？");
        assertThat(extract(input, List.of(item("什么是 SSE？")))).hasSize(1);
    }

    @Test
    void output_realUiPreambleConfirmation_extractsOnlyThreeActualQuestions() {
        var input = input("你们项目用了 Reactor 做流式处理，对吧？那我想问一下，除了 ReAct，还有哪些常见的 Agent 模式？然后 SSE 是什么？MCP 除了 SSE，还支持哪些传输方式？");
        var result = extract(input, List.of(item("除了 ReAct，还有哪些常见的 Agent 模式？"),
                item("SSE 是什么？"), item("MCP 除了 SSE，还支持哪些传输方式？")));
        assertThat(result).hasSize(3).extracting(question -> question.question()).allSatisfy(question -> assertThat(question).doesNotContain("Reactor"));
    }

    @Test
    void output_realAskBeforeConfirmation_cannotBeDiscardedAsPreamble() {
        var input = input("Reactor 是什么，对吧？什么是 SSE？");
        assertThatThrownBy(() -> extract(input, List.of(item("什么是 SSE？")))).isInstanceOf(QuestionRewriteOutputException.class);
    }

    @Test
    void output_trailingExclusionWithoutQuestionMark_cannotBeDroppedFromSources() {
        var input = input("Redis 怎么处理？先不讨论跨地域。");
        assertThatThrownBy(() -> extract(input, List.of(item("Redis 怎么处理？")))).isInstanceOf(QuestionRewriteOutputException.class);
    }

    @Test
    void output_onlyHistoricalQuestionAnchor_rejectsInventedCurrentAsk() {
        var input = new QuestionRewriteRequest("还有吗？", List.of("什么是 Redis？"), "questions-v1");
        assertThatThrownBy(() -> extract(input, List.of(item("什么是 Redis？")))).isInstanceOf(QuestionRewriteOutputException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"Redis 为什么使用缓存？", "Redis 为什么不用缓存，超时 20毫秒？", "Redis 为什么不用缓存，超时 30毫秒，使用 SETNX？"})
    void output_changedNegationNumberOrInventedAnswer_rejectsPerQuestion(String question) {
        var input = input("Redis 为什么不用缓存，超时 30毫秒？");
        assertThatThrownBy(() -> extract(input, List.of(Map.of("question", question, "sourceTexts", List.of(input.question())))))
                .isInstanceOf(QuestionRewriteOutputException.class);
    }

    @Test
    void output_missingTailQuestion_rejectsRatherThanSlicingToBudget() {
        var input = input("什么是 Redis？什么是 SSE？MCP 有哪些方式？");
        assertThatThrownBy(() -> extract(input, List.of(item("什么是 Redis？"), item("什么是 SSE？"))))
                .isInstanceOf(QuestionRewriteOutputException.class);
    }

    @Test
    void output_numberMovedToAnotherQuestion_doesNotTreatGlobalTokensAsSufficient() {
        var input = input("Redis 超时 30毫秒怎么处理？SSE 超时 60毫秒怎么处理？");
        var first = Map.of("question", "Redis 超时 60毫秒怎么处理？", "sourceTexts", List.of("Redis 超时 30毫秒怎么处理？"));
        var second = Map.of("question", "SSE 超时 30毫秒怎么处理？", "sourceTexts", List.of("SSE 超时 60毫秒怎么处理？"));
        assertThatThrownBy(() -> extract(input, List.of(first, second))).isInstanceOf(QuestionRewriteOutputException.class);
    }

    @Test
    void output_sixQuestions_rejectsEntireList() {
        var items = java.util.stream.IntStream.rangeClosed(1, 6).mapToObj(i -> item("第" + i + "题是什么？")).toList();
        var input = input(String.join("", items.stream().map(i -> i.get("question").toString()).toList()));
        assertThatThrownBy(() -> extract(input, items)).isInstanceOf(QuestionRewriteOutputException.class);
    }

    @Test
    void output_duplicateQuestion_rejectsInsteadOfInventingDiversity() {
        assertThatThrownBy(() -> extract(input("什么是 SSE？"), List.of(item("什么是 SSE？"), item("什么是 SSE？"))))
                .isInstanceOf(QuestionRewriteOutputException.class);
    }

    @Test
    void output_reversedSourceOrder_rejectsInsteadOfRenumberingReorderedQuestions() {
        assertThatThrownBy(() -> extract(input("什么是 SSE？什么是 MCP？"), List.of(item("什么是 MCP？"), item("什么是 SSE？"))))
                .isInstanceOf(QuestionRewriteOutputException.class);
    }

    @Test
    void output_excludedOptionTurnedIntoDefinition_rejectsChangedRelationship() {
        var input = input("MCP 除 SSE 外还有哪些传输方式？");
        assertThatThrownBy(() -> extract(input, List.of(Map.of("question", "MCP 的 SSE 是什么传输方式？", "sourceTexts", List.of(input.question())))))
                .isInstanceOf(QuestionRewriteOutputException.class);
    }

    @Test
    void output_unicodeQuestionAboveLimit_rejectsWithoutSplittingSupplementaryCharacters() {
        String question = "问".repeat(600) + "😀";
        assertThatThrownBy(() -> extract(input(question), List.of(item(question)))).isInstanceOf(QuestionRewriteOutputException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{\"action\":\"extracted\",\"questions\":[]}", "{\"action\":\"answer\",\"questions\":[]}",
            "{\"action\":\"unchanged\",\"questions\":[{}]}", "{\"action\":\"unchanged\",\"reason\":\"secret\"}"})
    void output_invalidShape_rejects(String value) throws Exception {
        assertThatThrownBy(() -> QuestionExtractionPolicy.output(json.readTree(value), input("什么是 SSE？")))
                .isInstanceOf(QuestionRewriteOutputException.class);
    }

    @Test
    void request_unknownFormat_rejectsBeforeSupplier() {
        assertThatThrownBy(() -> QuestionRewritePolicy.request(new QuestionRewriteRequest("问题", List.of(), "future")))
                .isInstanceOf(ApiException.class);
        assertThatCode(() -> QuestionRewritePolicy.request(new QuestionRewriteRequest("问题", List.of(), "single")))
                .doesNotThrowAnyException();
    }

    private List<com.interview.copilot.dto.questions.ExtractedQuestion> extract(QuestionRewriteRequest input, List<? extends Map<String, ?>> items) {
        return QuestionExtractionPolicy.output(json.valueToTree(Map.of("action", "extracted", "questions", items)), input);
    }

    private Map<String, Object> item(String question) {
        return Map.of("question", question, "sourceTexts", List.of(question));
    }

    private QuestionRewriteRequest input(String question) {
        return new QuestionRewriteRequest(question, List.of(), "questions-v1");
    }
}
