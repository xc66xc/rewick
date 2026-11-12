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

    @ParameterizedTest
    @ValueSource(strings = {"Redis 锁 30秒 超时，多实例如何处理？不讨论跨地域。", "Redis 锁 30毫秒 超时，如何处理？不讨论跨地域。", "Redis 锁 30秒 超时，多实例如何处理？"})
    void output_changedNumberUnitOrExclusion_rejectsResult(String question) throws Exception {
        var input = new QuestionRewriteRequest("Redis 锁 30毫秒 超时，多实例怎么办，不讨论跨地域。", List.of());
        String unsafe = question.replace("多实例", "集群");
        if (question.equals("Redis 锁 30毫秒 超时，如何处理？不讨论跨地域。")) unsafe += " 使用 SETNX？";
        var node = json.createObjectNode().put("action", "rewritten").put("question", unsafe);

        assertThatThrownBy(() -> QuestionRewritePolicy.output(node, input)).isInstanceOf(QuestionRewriteOutputException.class);
    }

    @Test
    void output_preservesNumbersIdentifiersAndNegation_acceptsConservativeCleanup() {
        var input = new QuestionRewriteRequest("那个 Redis 30毫秒过期，task_id 重复了怎么办，不讨论跨地域。", List.of());
        var node = json.createObjectNode().put("action", "rewritten").put("question", "Redis 30毫秒过期，task_id 重复时如何处理？不讨论跨地域。");

        assertThatCode(() -> QuestionRewritePolicy.output(node, input)).doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {"不用", "没有", "无需", "不支持", "不等于", "不一定", "不会", "无法", "不可能", "不是", "别展开"})
    void output_negationRemoved_rejectsMeaningFlip(String negation) {
        var input = new QuestionRewriteRequest("为什么" + negation + " Redis？", List.of());
        var node = json.createObjectNode().put("action", "rewritten").put("question", "为什么使用 Redis？");
        assertThatThrownBy(() -> QuestionRewritePolicy.output(node, input)).isInstanceOf(QuestionRewriteOutputException.class);
    }

    @Test
    void output_newFieldOrInvalidAction_rejects() throws Exception {
        assertThatThrownBy(() -> QuestionRewritePolicy.output(json.readTree("{\"action\":\"answer\",\"question\":\"提示\"}"),
                new QuestionRewriteRequest("问题", List.of()))).isInstanceOf(QuestionRewriteOutputException.class);
    }
}
