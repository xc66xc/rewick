package com.interview.copilot.validation.questions;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.exception.questions.QuestionRewriteOutputException;
import com.interview.copilot.request.questions.QuestionRewriteRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class QuestionRewritePolicyTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void request_overRewriteLimit_preservesWholeQuestionForSkip() {
        assertThatCode(() -> QuestionRewritePolicy.request(new QuestionRewriteRequest("问".repeat(3001), List.of())))
                .doesNotThrowAnyException();
    }

    @Test
    void request_contextOverTotalLimit_rejectsRatherThanSilentlyTruncating() {
        assertThatThrownBy(() -> QuestionRewritePolicy.request(new QuestionRewriteRequest("问题", List.of("上".repeat(800), "下".repeat(701)))))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void request_unknownResultFormat_rejects() {
        assertThatThrownBy(() -> QuestionRewritePolicy.request(new QuestionRewriteRequest("问题", List.of(), "unsupported")))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void output_modelWording_doesNotApplySemanticConstraints() {
        var node = json.createObjectNode().put("action", "rewritten").put("question", "Redis 用 SETNX 如何处理？");

        assertThatCode(() -> QuestionRewritePolicy.output(node)).doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {"[]", "{}", "{\"action\":3}", "{\"action\":\"answer\",\"question\":\"提示\"}",
            "{\"action\":\"rewritten\",\"question\":\"\"}", "{\"action\":\"rewritten\",\"question\":4}",
            "{\"action\":\"rewritten\",\"question\":\"问题\",\"answer\":\"内容\"}"})
    void output_invalidStructure_rejects(String content) throws Exception {
        assertThatThrownBy(() -> QuestionRewritePolicy.output(json.readTree(content)))
                .isInstanceOf(QuestionRewriteOutputException.class);
    }

    @Test
    void output_overLength_rejects() {
        var node = json.createObjectNode().put("action", "rewritten").put("question", "问".repeat(3001));

        assertThatThrownBy(() -> QuestionRewritePolicy.output(node)).isInstanceOf(QuestionRewriteOutputException.class);
    }
}
