package com.interview.copilot.service.impl.references;

import com.interview.copilot.common.references.PlatformEmbeddingClient;
import com.interview.copilot.converter.references.ReferenceExcerptConverter;
import com.interview.copilot.mapper.references.ReferenceMapper;
import com.interview.copilot.response.references.ReferenceExcerptResponse;
import com.interview.copilot.response.references.ReferenceRetrievalResponse;
import com.interview.copilot.service.references.ReferenceSearchService;
import com.interview.copilot.service.references.ReferenceStorageService;
import com.interview.copilot.service.usage.UsageService;
import com.interview.copilot.validation.ai.LlmRequestPolicy;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
public class ReferenceSearchServiceImpl implements ReferenceSearchService {
    private static final Logger LOG = LoggerFactory.getLogger(ReferenceSearchServiceImpl.class);
    private final ReferenceStorageService repository;
    private final PlatformEmbeddingClient embedding;
    private final UsageService usage;
    private final ReferenceMapper mapper;

    public ReferenceSearchServiceImpl(
            ReferenceStorageService repository,
            PlatformEmbeddingClient embedding,
            UsageService usage,
            ReferenceMapper mapper) {
        this.repository = repository;
        this.embedding = embedding;
        this.usage = usage;
        this.mapper = mapper;
    }

    public ReferenceRetrievalResponse search(
            long user, String requestId, String query, List<UUID> ids) {
        if (ids.isEmpty()) {
            return result("disabled", "当前环境未选择参考资料。", List.of());
        }
        for (UUID id : ids) {
            repository.require(user, id.toString());
        }
        String identifier = LlmRequestPolicy.requestId(requestId);
        try (var lease = usage.start(user, identifier, "knowledge")) {
            try {
                var selection = embedding.selection();
                usage.describeModel(user, identifier, "knowledge", selection.config().getModel());
                ReferenceRetrievalResponse result = retrieve(user, query, ids, selection);
                lease.complete();
                return result;
            } catch (RuntimeException error) {
                lease.fail();
                LOG.warn(
                        "Reference search unavailable user={} exceptionType={}",
                        user,
                        error.getClass().getSimpleName());
                return result("degraded", "资料检索暂时不可用，继续生成回答。", List.of());
            }
        }
    }

    private ReferenceRetrievalResponse retrieve(
            long user, String query, List<UUID> ids, PlatformEmbeddingClient.Selection selection) {
        List<Double> vector;
        try {
            vector = embedding.embed(selection, List.of(query)).getFirst();
        } catch (RuntimeException error) {
            LOG.warn(
                    "Reference vector lookup failed user={} exceptionType={}; using keyword"
                            + " retrieval",
                    user,
                    error.getClass().getSimpleName());
            return result(
                    "degraded",
                    "向量服务暂不可用，已使用资料关键词检索。",
                    keyword(user, query, ids, selection.fingerprint()));
        }
        var excerpts =
                mapper.vectorSearch(
                        user,
                        selection.fingerprint(),
                        ids.stream().map(UUID::toString).toList(),
                        vector.toString()).stream()
                        .map(ReferenceExcerptConverter::toResponse)
                        .toList();
        return result(
                excerpts.isEmpty() ? "empty" : "ready",
                excerpts.isEmpty() ? "未找到相关资料；模型变更后请重建资料。" : "",
                excerpts);
    }

    private List<ReferenceExcerptResponse> keyword(
            long user, String query, List<UUID> ids, String fingerprint) {
        Set<String> terms = terms(query);
        if (terms.isEmpty()) {
            return List.of();
        }
        return mapper
                .keywordCandidates(user, fingerprint, ids.stream().map(UUID::toString).toList())
                .stream()
                .map(ReferenceExcerptConverter::toResponse)
                .map(excerpt -> new Scored(excerpt, score(excerpt.text(), terms)))
                .filter(row -> row.score() > 0)
                .sorted(Comparator.comparingDouble(Scored::score).reversed())
                .limit(20)
                .map(Scored::excerpt)
                .toList();
    }

    private Set<String> terms(String query) {
        Set<String> result = new HashSet<>();
        for (String token : query.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+")) {
            if (token.length() < 2) {
                continue;
            }
            result.add(token);
            if (token.codePoints()
                    .anyMatch(
                            code ->
                                    Character.UnicodeScript.of(code)
                                            == Character.UnicodeScript.HAN)) {
                for (int index = 0; index < token.length() - 1; index++) {
                    result.add(token.substring(index, index + 2));
                }
            }
        }
        return result;
    }

    private double score(String text, Set<String> terms) {
        String lower = text.toLowerCase(Locale.ROOT);
        return terms.stream().filter(lower::contains).count();
    }

    private ReferenceRetrievalResponse result(
            String status, String message, List<ReferenceExcerptResponse> input) {
        List<ReferenceExcerptResponse> selected = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        int length = 0;
        for (var excerpt : input) {
            if (!seen.add(excerpt.text())) {
                continue;
            }
            if (selected.size() == 6 || length + excerpt.text().length() > 4800) {
                break;
            }
            selected.add(excerpt);
            length += excerpt.text().length();
        }
        return new ReferenceRetrievalResponse(status, message, List.copyOf(selected));
    }

    private record Scored(ReferenceExcerptResponse excerpt, double score) {}
}
