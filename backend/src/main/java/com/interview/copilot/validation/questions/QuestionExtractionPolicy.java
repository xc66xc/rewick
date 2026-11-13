package com.interview.copilot.validation.questions;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.dto.questions.ExtractedQuestion;
import com.interview.copilot.exception.questions.QuestionRewriteOutputException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** Validates the readable shape and bounded size of model output, not its meaning. */
public final class QuestionExtractionPolicy {
    private QuestionExtractionPolicy() {}

    public static List<ExtractedQuestion> output(JsonNode value) {
        fields(value, Set.of("action", "questions"));
        String action = value.path("action").asText();
        if (Set.of("unchanged", "ambiguous").contains(action)) {
            if (value.has("questions") && (!value.path("questions").isArray() || !value.path("questions").isEmpty())) throw unsafe();
            return List.of();
        }
        if (!"extracted".equals(action)) throw unsafe();
        value.path("questions").forEach(node -> fields(node, Set.of("question", "sourceTexts", "contextSourceTexts")));
        return questions(value.path("questions"));
    }

    public static List<ExtractedQuestion> questions(JsonNode nodes) {
        if (!nodes.isArray() || nodes.isEmpty() || nodes.size() > 5) throw unsafe();
        List<ExtractedQuestion> result = new ArrayList<>();
        for (JsonNode node : nodes) {
            fields(node, Set.of("id", "question", "sourceTexts", "contextSourceTexts"));
            String question = text(node.path("question"), 600);
            List<String> sources = sources(node.path("sourceTexts"), 3000, true);
            List<String> context = sources(node.path("contextSourceTexts"), 1500, false);
            String id = "q" + (result.size() + 1);
            if (node.has("id") && !id.equals(node.path("id").asText())) throw unsafe();
            result.add(new ExtractedQuestion(id, question, sources, context));
        }
        if (total(result.stream().map(ExtractedQuestion::question).toList()) > 1500
                || total(result.stream().flatMap(q -> q.sourceTexts().stream()).toList()) > 3000
                || total(result.stream().flatMap(q -> q.contextSourceTexts().stream()).toList()) > 1500) throw unsafe();
        return List.copyOf(result);
    }

    private static List<String> sources(JsonNode nodes, int maximum, boolean required) {
        if (!required && nodes.isMissingNode()) return List.of();
        if (!nodes.isArray() || nodes.size() > 10 || required && nodes.isEmpty()) throw unsafe();
        List<String> values = new ArrayList<>();
        for (JsonNode node : nodes) values.add(text(node, maximum));
        if (total(values) > maximum) throw unsafe();
        return List.copyOf(values);
    }

    private static void fields(JsonNode node, Set<String> allowed) {
        if (!node.isObject()) throw unsafe();
        node.fieldNames().forEachRemaining(name -> { if (!allowed.contains(name)) throw unsafe(); });
    }

    private static String text(JsonNode node, int maximum) {
        if (!node.isTextual() || node.asText().isBlank()
                || QuestionRewritePolicy.characters(node.asText()) > maximum) throw unsafe();
        return node.asText().trim();
    }

    private static int total(List<String> values) {
        return values.stream().mapToInt(QuestionRewritePolicy::characters).sum();
    }

    private static QuestionRewriteOutputException unsafe() {
        return new QuestionRewriteOutputException();
    }
}
