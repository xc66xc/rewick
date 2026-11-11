package com.interview.copilot.common.references;

import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import com.interview.copilot.exception.ai.ProviderFailure;
import com.interview.copilot.model.references.ReferenceRecall;
import com.interview.copilot.util.rerank.BailianRerankProtocol;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;

/** Bounded child evidence only: no parent fetch, summarization, or query truncation. */
public final class ReferenceRerankInput {
    private static final int MAX_QUERY_BYTES = 3500;
    private static final int MAX_DOCUMENT_BYTES = 3500;
    private static final int MAX_TOTAL_BYTES = 100000;
    private static final int MAX_CHARACTERS = 1600;
    private static final int MIN_DOCUMENT_BYTES = 512;
    private static final String SEPARATOR = "\n\n";

    private ReferenceRerankInput() {}

    public static List<String> documents(String query, List<ReferenceRecall.Fused> candidates, String model) {
        if (!BailianRerankProtocol.supports(model) || query == null || query.isBlank()
                || candidates.isEmpty() || candidates.size() > 40) {
            throw new ProviderFailure("invalid_input", "重排序模型或输入无效。");
        }
        int queryBytes = bytes(query);
        int budget = Math.min(MAX_DOCUMENT_BYTES, MAX_TOTAL_BYTES / candidates.size() - queryBytes);
        if (queryBytes > MAX_QUERY_BYTES || budget < MIN_DOCUMENT_BYTES) {
            throw inputLimit();
        }
        return candidates.stream().map(candidate -> document(candidate.matches(), budget)).toList();
    }

    private static String document(List<ReferenceCandidateEntity> matches, int byteBudget) {
        var unique = new LinkedHashMap<Long, String>();
        for (var match : matches) {
            if (match.text() != null && !match.text().isBlank()) unique.putIfAbsent(match.chunkId(), match.text());
            if (unique.size() == 2) break;
        }
        if (unique.isEmpty()) throw new ProviderFailure("invalid_input", "重排序候选缺少可用子片段。");
        List<Piece> pieces = unique.values().stream().map(ReferenceRerankInput::piece).toList();
        int separators = SEPARATOR.length() * (pieces.size() - 1);
        int characters = MAX_CHARACTERS - separators - pieces.stream().mapToInt(p -> p.title().length()).sum();
        int remainingBytes = byteBudget - separators - pieces.stream().mapToInt(p -> bytes(p.title())).sum();
        if (characters < 0 || remainingBytes < 0) throw inputLimit();
        List<String> texts = new ArrayList<>();
        for (int index = 0; index < pieces.size(); index++) {
            Piece piece = pieces.get(index);
            int remaining = pieces.size() - index;
            String body = prefix(piece.body(), characters / remaining, remainingBytes / remaining);
            texts.add(piece.title() + body);
            characters -= body.length();
            remainingBytes -= bytes(body);
        }
        return String.join(SEPARATOR, texts);
    }

    private static Piece piece(String text) {
        int newline = text.indexOf('\n');
        if (newline < 0 || newline > 512) return new Piece("", text);
        return new Piece(text.substring(0, newline + 1), text.substring(newline + 1));
    }

    private static String prefix(String text, int characters, int byteBudget) {
        int end = 0;
        int usedBytes = 0;
        while (end < text.length()) {
            int point = text.codePointAt(end);
            int width = Character.charCount(point);
            int pointBytes = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
            if (end + width > characters || usedBytes + pointBytes > byteBudget) break;
            usedBytes += pointBytes;
            end += width;
        }
        return text.substring(0, end);
    }

    private static int bytes(String value) {
        return value.getBytes(StandardCharsets.UTF_8).length;
    }

    private static ProviderFailure inputLimit() {
        return new ProviderFailure("input_limit", "重排序输入超过已登记的安全容量，已保留原排序。");
    }

    private record Piece(String title, String body) {}
}
