package com.interview.copilot.validation.questions;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.dto.questions.ExtractedQuestion;
import com.interview.copilot.exception.questions.QuestionRewriteOutputException;
import com.interview.copilot.exception.questions.QuestionRewriteValidationRule;
import com.interview.copilot.request.questions.QuestionRewriteRequest;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Source anchoring is conservative evidence validation, not a proof of semantic equivalence. */
public final class QuestionExtractionPolicy {
    private QuestionExtractionPolicy() {}

    public static List<ExtractedQuestion> output(JsonNode value, QuestionRewriteRequest input) {
        fields(value, Set.of("action", "questions"));
        String action = value.path("action").asText();
        if (Set.of("unchanged", "ambiguous").contains(action)) {
            if (value.has("questions") && (!value.path("questions").isArray() || !value.path("questions").isEmpty())) throw unsafe();
            return List.of();
        }
        if (!"extracted".equals(action)) throw unsafe();
        value.path("questions").forEach(node -> fields(node, Set.of("question", "sourceTexts", "contextSourceTexts")));
        return questions(value.path("questions"), input);
    }

    public static List<ExtractedQuestion> questions(JsonNode nodes, QuestionRewriteRequest input) {
        if (!nodes.isArray() || nodes.isEmpty() || nodes.size() > 5) throw unsafe();
        List<ExtractedQuestion> result = new ArrayList<>();
        Set<String> unique = new HashSet<>();
        for (JsonNode node : nodes) {
            fields(node, Set.of("id", "question", "sourceTexts", "contextSourceTexts"));
            String question = text(node.path("question"), 600);
            if (!unique.add(normalize(question).replaceAll("[\\p{P}\\s]", ""))) throw unsafe();
            List<String> sources = sources(node.path("sourceTexts"), List.of(input.question()), 3000, true);
            List<String> context = sources(node.path("contextSourceTexts"), input.context(), 1500, false);
            validateQuestion(question, sources, context);
            String id = "q" + (result.size() + 1);
            if (node.has("id") && !id.equals(node.path("id").asText())) throw unsafe();
            result.add(new ExtractedQuestion(id, question, sources, context));
        }
        if (total(result.stream().map(ExtractedQuestion::question).toList()) > 1500
                || total(result.stream().flatMap(q -> q.sourceTexts().stream()).toList()) > 3000
                || total(result.stream().flatMap(q -> q.contextSourceTexts().stream()).toList()) > 1500) throw unsafe();
        order(input.question(), result);
        QuestionAskCoverage.validate(input.question(), result);
        return List.copyOf(result);
    }

    private static void validateQuestion(String question, List<String> sources, List<String> context) {
        String current = normalize(String.join("\n", sources));
        String rewritten = normalize(question);
        var required = QuestionRewritePolicy.protectedTokens(current);
        var allowed = new HashSet<>(required);
        allowed.addAll(QuestionRewritePolicy.protectedTokens(normalize(String.join("\n", context))));
        if (!QuestionRewritePolicy.protectedTokens(rewritten).containsAll(required)
                || !allowed.containsAll(QuestionRewritePolicy.protectedTokens(rewritten)))
            throw unsafe(QuestionRewriteValidationRule.CONSTRAINT);
        QuestionRewritePolicy.sourceConstraints(current, rewritten);
        relationships(current, rewritten);
    }

    static void relationships(String current, String rewritten) {
        if (current.matches("(?s).*(?:除了?|排除).*") && !rewritten.matches("(?s).*(?:除了?|排除).*"))
            throw unsafe(QuestionRewriteValidationRule.CONSTRAINT);
        if (current.contains("区别") && !rewritten.contains("区别") && !rewritten.contains("差异"))
            throw unsafe(QuestionRewriteValidationRule.CONSTRAINT);
        if (current.contains("为什么") && !rewritten.contains("为什么") && !rewritten.contains("原因"))
            throw unsafe(QuestionRewriteValidationRule.CONSTRAINT);
    }

    private static List<String> sources(JsonNode nodes, List<String> available, int maximum, boolean required) {
        if (!required && nodes.isMissingNode()) return List.of();
        if (!nodes.isArray() || nodes.size() > 10 || required && nodes.isEmpty())
            throw unsafe(QuestionRewriteValidationRule.SOURCE);
        List<String> values = new ArrayList<>();
        for (JsonNode node : nodes) {
            String value = sourceText(node, maximum);
            if (value.replaceAll("[\\p{P}\\s]", "").isBlank()) throw unsafe(QuestionRewriteValidationRule.SOURCE);
            if (available.stream().noneMatch(raw -> raw.contains(value)) || values.contains(value))
                throw unsafe(QuestionRewriteValidationRule.SOURCE);
            values.add(value);
        }
        if (total(values) > maximum) throw unsafe(QuestionRewriteValidationRule.SOURCE);
        return List.copyOf(values);
    }

    private static String sourceText(JsonNode node, int maximum) {
        if (!node.isTextual() || node.asText().isBlank()
                || QuestionRewritePolicy.characters(node.asText()) > maximum)
            throw unsafe(QuestionRewriteValidationRule.SOURCE);
        return node.asText().trim();
    }

    private static void order(String original, List<ExtractedQuestion> questions) {
        int previous = -1;
        for (var question : questions) {
            int position = question.sourceTexts().stream().mapToInt(original::indexOf).max().orElse(-1);
            if (position < previous) throw unsafe(QuestionRewriteValidationRule.QUESTION_ANCHOR);
            previous = position;
        }
    }

    private static void fields(JsonNode node, Set<String> allowed) {
        if (!node.isObject()) throw unsafe();
        node.fieldNames().forEachRemaining(name -> { if (!allowed.contains(name)) throw unsafe(); });
    }

    private static String text(JsonNode node, int maximum) {
        if (!node.isTextual() || node.asText().isBlank() || QuestionRewritePolicy.characters(node.asText()) > maximum) throw unsafe();
        return node.asText().trim();
    }

    private static int total(List<String> values) {
        return values.stream().mapToInt(QuestionRewritePolicy::characters).sum();
    }

    private static String normalize(String value) {
        return QuestionRewritePolicy.normalize(value);
    }

    private static QuestionRewriteOutputException unsafe() {
        return new QuestionRewriteOutputException();
    }

    private static QuestionRewriteOutputException unsafe(QuestionRewriteValidationRule rule) {
        return new QuestionRewriteOutputException(rule);
    }
}
