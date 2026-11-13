package com.interview.copilot.validation.questions;

import com.interview.copilot.dto.questions.ExtractedQuestion;
import com.interview.copilot.exception.questions.QuestionRewriteOutputException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;

/** Bounded literal ask coverage; ambiguous syntax is rejected rather than claimed equivalent. */
final class QuestionAskCoverage {
    private static final Pattern ASK = Pattern.compile("[？?]|什么|怎么|如何|哪些|哪种|为什么|为何|为啥|请解释|介绍一下|说一下|讲一下|举个例子|是否|能不能");
    private static final Pattern BACKGROUND = Pattern.compile("^(?:我看到|我看|我注意到|看到|听到|前面|你(?:们)?(?:项目|系统|刚才|之前|前面|用|使用|基于)|刚才|之前|这里先|这里提到)");
    private static final Pattern PARALLEL = Pattern.compile("(?:[，,]\\s*(?:以及|另外(?:一个)?|此外|还有(?:一个)?|再问(?:一下|一个)?|然后|同时|接着)\\s*|以及)");
    private static final Pattern FILLER = Pattern.compile("就是说|那个|嗯|呃|啊|呢|呀|吧|什么是|是什么|什么|怎么|如何|哪些|哪种|是否|请解释|介绍一下|说一下|讲一下");

    private QuestionAskCoverage() {}

    static void validate(String original, List<ExtractedQuestion> questions) {
        for (String unit : asks(original)) {
            if (questions.stream().noneMatch(question -> supports(unit, question))) throw unsafe();
        }
    }

    private static List<String> asks(String original) {
        List<String> result = new ArrayList<>();
        String pending = "";
        for (String clause : original.split("(?<=[。！？!?；;\\n])")) {
            String ask = withoutBackground(clause.trim());
            if (isAsk(ask)) {
                var values = new ArrayList<>(units(ask));
                values.set(0, pending + values.getFirst());
                pending = "";
                result.addAll(values);
            } else if (QuestionRewritePolicy.hasConstraints(clause) && !BACKGROUND.matcher(clause.trim()).find()) {
                if (result.isEmpty()) pending += clause;
                else result.set(result.size() - 1, result.getLast() + clause);
            }
        }
        return result;
    }

    private static List<String> units(String value) {
        List<String> result = new ArrayList<>();
        var matcher = PARALLEL.matcher(value);
        int start = 0;
        while (matcher.find()) {
            String left = value.substring(start, matcher.start());
            String right = value.substring(matcher.end());
            if (!isAsk(left) || !isAsk(right)) continue;
            result.add(left);
            start = matcher.end();
            if (result.size() >= 5) throw unsafe();
        }
        result.add(value.substring(start));
        return result;
    }

    private static String withoutBackground(String value) {
        String statement = value.replaceFirst("[，,]?\\s*(?:对吧|是吧|对不对|是不是|没错吧|对吗)[？?]$", "");
        if (!statement.equals(value) && !isAsk(statement)
                && (statement.isBlank() || BACKGROUND.matcher(statement).find())) return "";
        value = value.replaceFirst("^(?:(?:那|那么|然后|接着)[，,\\s]*)?(?:我想问(?:一下)?|我还想问(?:一下)?|请问(?:一下)?|想问(?:一下)?)[，,\\s]*", "")
                .replaceFirst("^(?:然后|那么|接着)[，,\\s]*", "");
        if (!BACKGROUND.matcher(value).find()) return value;
        var commas = Pattern.compile("[，,]").matcher(value);
        while (commas.find()) {
            String prefix = value.substring(0, commas.start());
            String suffix = value.substring(commas.end()).trim().replaceFirst("^(?:那么|那|然后|所以)", "");
            if (!isAsk(prefix) && isAsk(suffix)) return suffix;
        }
        return value;
    }

    private static boolean supports(String original, ExtractedQuestion question) {
        String raw = QuestionRewritePolicy.normalize(original);
        String output = QuestionRewritePolicy.normalize(question.question());
        if (!QuestionRewritePolicy.protectedTokens(output).containsAll(QuestionRewritePolicy.protectedTokens(raw))) return false;
        try {
            QuestionRewritePolicy.sourceConstraints(raw, output);
            QuestionExtractionPolicy.relationships(raw, output);
        } catch (QuestionRewriteOutputException error) {
            return false;
        }
        String required = literal(original);
        if (required.isBlank()) return false;
        boolean[] covered = new boolean[required.length()];
        for (String source : question.sourceTexts()) cover(required, literal(source), covered);
        for (boolean value : covered) if (!value) return false;
        return true;
    }

    private static void cover(String required, String source, boolean[] covered) {
        if (source.isBlank()) return;
        if (source.contains(required)) {
            Arrays.fill(covered, true);
            return;
        }
        for (int index = required.indexOf(source); index >= 0; index = required.indexOf(source, index + 1))
            Arrays.fill(covered, index, index + source.length(), true);
    }

    private static String literal(String value) {
        String normalized = QuestionRewritePolicy.normalize(value).replaceAll("[\\p{P}\\s]", "");
        return FILLER.matcher(normalized).replaceAll("");
    }

    private static boolean isAsk(String value) {
        return ASK.matcher(value).find();
    }

    private static QuestionRewriteOutputException unsafe() {
        return new QuestionRewriteOutputException();
    }
}
