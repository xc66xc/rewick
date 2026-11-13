package com.interview.copilot.validation.questions;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.common.questions.SpokenExtractionFixture;
import com.interview.copilot.dto.questions.ExtractedQuestion;
import com.interview.copilot.exception.questions.QuestionRewriteOutputException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class QuestionExtractionPolicyTest {
    private final ObjectMapper json = new ObjectMapper();

    @ParameterizedTest
    @ValueSource(ints = {0, 1, 2})
    void output_spokenQuestions_acceptsModelExtractionAndGeneratesSequentialIds(int variant) {
        var result = QuestionExtractionPolicy.output(json.valueToTree(SpokenExtractionFixture.output(variant)));

        assertThat(result).extracting(ExtractedQuestion::id).containsExactly("q1", "q2", "q3");
        assertThat(result).hasSize(3);
    }

    @Test
    void output_modelWordingAndRepeatedSources_doesNotJudgeMeaningOrLiteralMatches() {
        var item = Map.of("question", "除了SSE之外，还有哪些协议？", "sourceTexts", List.of("模型整理过的来源", "模型整理过的来源"),
                "contextSourceTexts", List.of("模型整理过的上下文"));

        var result = extract(List.of(item, item));

        assertThat(result).extracting(ExtractedQuestion::id).containsExactly("q1", "q2");
        assertThat(result).allSatisfy(question -> {
            assertThat(question.question()).isEqualTo("除了SSE之外，还有哪些协议？");
            assertThat(question.sourceTexts()).containsExactly("模型整理过的来源", "模型整理过的来源");
            assertThat(question.contextSourceTexts()).containsExactly("模型整理过的上下文");
        });
    }

    @Test
    void output_modelOrderAndPunctuationSource_preservesModelOutput() {
        var result = extract(List.of(item("后一个问题", "？"), item("前一个问题", "！")));

        assertThat(result).extracting(ExtractedQuestion::question).containsExactly("后一个问题", "前一个问题");
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "[]", "{\"action\":7}", "{\"action\":\"answer\"}",
            "{\"action\":\"extracted\",\"questions\":[]}", "{\"action\":\"extracted\",\"questions\":{}}",
            "{\"action\":\"extracted\",\"questions\":[{\"question\":\"问题\",\"sourceTexts\":[]}]}",
            "{\"action\":\"extracted\",\"questions\":[{\"question\":\"问题\",\"sourceTexts\":[3]}]}",
            "{\"action\":\"extracted\",\"questions\":[{\"question\":\"问题\",\"sourceTexts\":[\" \"]}]}",
            "{\"action\":\"extracted\",\"questions\":[{\"question\":\" \",\"sourceTexts\":[\"来源\"]}]}",
            "{\"action\":\"extracted\",\"questions\":[{\"question\":3,\"sourceTexts\":[\"来源\"]}]}",
            "{\"action\":\"extracted\",\"questions\":[{\"question\":\"问题\",\"sourceTexts\":[\"来源\"],\"contextSourceTexts\":null}]}",
            "{\"action\":\"extracted\",\"questions\":[{\"id\":\"q1\",\"question\":\"问题\",\"sourceTexts\":[\"来源\"]}]}",
            "{\"action\":\"extracted\",\"questions\":[{\"question\":\"问题\",\"sourceTexts\":[\"来源\"],\"answer\":\"内容\"}]}",
            "{\"action\":\"unchanged\",\"questions\":[{}]}", "{\"action\":\"ambiguous\",\"extra\":true}"})
    void output_invalidStructure_rejects(String content) throws Exception {
        assertThatThrownBy(() -> QuestionExtractionPolicy.output(json.readTree(content)))
                .isInstanceOf(QuestionRewriteOutputException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"unchanged", "ambiguous"})
    void output_noExtraction_returnsEmptyQuestions(String action) {
        assertThat(QuestionExtractionPolicy.output(json.valueToTree(Map.of("action", action)))).isEmpty();
    }

    @Test
    void output_sixQuestions_rejectsWholeList() {
        assertThatThrownBy(() -> extract(IntStream.range(0, 6).mapToObj(index -> item("问题" + index, "来源")).toList()))
                .isInstanceOf(QuestionRewriteOutputException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"question", "questionTotal", "source", "sourceTotal", "context", "contextTotal", "sourceCount"})
    void output_characterAndSourceCountBoundaries_rejects(String scenario) {
        assertThatThrownBy(() -> extract(overLimit(scenario))).isInstanceOf(QuestionRewriteOutputException.class);
    }

    @Test
    void output_unicodeCharacterLimit_countsCodePointsRatherThanUtf16Units() {
        assertThat(extract(List.of(item("🙂".repeat(600), "来源")))).singleElement()
                .satisfies(question -> assertThat(question.question()).isEqualTo("🙂".repeat(600)));
        assertThatThrownBy(() -> extract(List.of(item("🙂".repeat(601), "来源"))))
                .isInstanceOf(QuestionRewriteOutputException.class);
    }

    private List<Map<String, Object>> overLimit(String scenario) {
        return switch (scenario) {
            case "question" -> List.of(item("问".repeat(601), "来源"));
            case "questionTotal" -> IntStream.range(0, 3).mapToObj(index -> item("问".repeat(501), "来源")).toList();
            case "source" -> List.of(item("问题", "源".repeat(3001)));
            case "sourceTotal" -> List.of(item("问题", "源".repeat(1501)), item("问题", "源".repeat(1500)));
            case "context" -> List.of(Map.of("question", "问题", "sourceTexts", List.of("来源"),
                    "contextSourceTexts", List.of("源".repeat(1501))));
            case "contextTotal" -> List.of(Map.of("question", "问题", "sourceTexts", List.of("来源"),
                    "contextSourceTexts", List.of("源".repeat(751))), Map.of("question", "问题", "sourceTexts", List.of("来源"),
                    "contextSourceTexts", List.of("源".repeat(750))));
            case "sourceCount" -> List.of(Map.of("question", "问题", "sourceTexts", java.util.Collections.nCopies(11, "来源")));
            default -> throw new IllegalArgumentException(scenario);
        };
    }

    private List<ExtractedQuestion> extract(List<? extends Map<String, ?>> items) {
        return QuestionExtractionPolicy.output(json.valueToTree(Map.of("action", "extracted", "questions", items)));
    }

    private Map<String, Object> item(String question, String source) {
        return Map.of("question", question, "sourceTexts", List.of(source));
    }
}
