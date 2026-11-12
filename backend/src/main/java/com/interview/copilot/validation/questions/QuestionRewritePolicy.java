package com.interview.copilot.validation.questions;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.exception.questions.QuestionRewriteOutputException;
import com.interview.copilot.request.questions.QuestionRewriteRequest;
import org.springframework.http.HttpStatus;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/** Conservative objective checks complement the semantic prompt; they cannot prove equivalence. */
public final class QuestionRewritePolicy {
    public static final int MAX_QUESTION_CHARACTERS = 3000;
    private static final Pattern PROTECTED = Pattern.compile(
            "`[^`]+`|[A-Za-z][A-Za-z0-9_.:+/#-]*|[0-9]+(?:\\.[0-9]+)*(?:\\s*(?:毫秒|秒|分钟|小时|天|年|个|次|%|MiB|MB|GB|ms))?",
            Pattern.CASE_INSENSITIVE);
    private static final List<String> CONSTRAINTS = List.of("不能", "不得", "不允许", "不需要", "不要",
            "不用", "没有", "无需", "不支持", "不等于", "不一定", "不会", "无法", "不可能", "不是",
            "不讨论", "不考虑", "不涉及", "排除", "至少", "最多", "大于", "小于", "以上", "以下",
            "别展开", "别讨论", "别考虑", "别讲", "别说", "别加", "别用", "别涉及", "别假设", "别修改");

    private QuestionRewritePolicy() {}

    public static void request(QuestionRewriteRequest input) {
        if (input == null || input.question() == null || input.question().isBlank()
                || characters(input.question()) > 20000 || input.context() == null) throw invalid();
        if (input.context().size() > 6 || input.context().stream().anyMatch(value -> value == null
                || value.isBlank() || characters(value) > 1500)) throw invalid();
        if (input.context().stream().mapToInt(QuestionRewritePolicy::characters).sum() > 1500) throw invalid();
    }

    public static String requestId(String value) {
        try {
            if (value == null || !UUID.fromString(value).toString().equalsIgnoreCase(value)) throw invalid();
            return value.toLowerCase(Locale.ROOT);
        } catch (IllegalArgumentException error) {
            throw invalid();
        }
    }

    public static int characters(String value) {
        return value.codePointCount(0, value.length());
    }

    public static void output(JsonNode value, QuestionRewriteRequest input) {
        if (value == null || !value.isObject() || value.size() > 2
                || !value.path("action").isTextual()) throw new QuestionRewriteOutputException();
        value.fieldNames().forEachRemaining(name -> {
            if (!Set.of("action", "question").contains(name)) throw new QuestionRewriteOutputException();
        });
        String action = value.path("action").asText();
        if (!Set.of("rewritten", "unchanged", "ambiguous").contains(action)) throw new QuestionRewriteOutputException();
        if (!"rewritten".equals(action)) return;
        rewritten(value.path("question"), input);
    }

    private static void rewritten(JsonNode question, QuestionRewriteRequest input) {
        if (!question.isTextual() || question.asText().isBlank()
                || characters(question.asText()) > MAX_QUESTION_CHARACTERS) throw new QuestionRewriteOutputException();
        String original = normalize(input.question());
        String rewritten = normalize(question.asText());
        if (!protectedTokens(rewritten).containsAll(protectedTokens(original))) throw new QuestionRewriteOutputException();
        for (String constraint : CONSTRAINTS) {
            if (original.contains(constraint) && !rewritten.contains(constraint)) throw new QuestionRewriteOutputException();
        }
        var available = protectedTokens(normalize(input.question() + String.join("\n", input.context())));
        if (!available.containsAll(protectedTokens(rewritten))) throw new QuestionRewriteOutputException();
    }

    private static Set<String> protectedTokens(String text) {
        Set<String> values = new HashSet<>();
        var matcher = PROTECTED.matcher(text);
        while (matcher.find()) values.add(matcher.group().replaceAll("\\s+", ""));
        return values;
    }

    private static String normalize(String value) {
        return value.toLowerCase(Locale.ROOT);
    }

    private static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "QUESTION_REWRITE_INVALID", "问题改写输入格式无效或超出范围。");
    }
}
