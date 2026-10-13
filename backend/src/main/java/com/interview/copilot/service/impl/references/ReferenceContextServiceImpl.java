package com.interview.copilot.service.impl.references;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.interview.copilot.common.references.ReferenceText;
import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.entity.references.ReferenceScopeEntity;
import com.interview.copilot.entity.references.ReferenceContextEntity;
import com.interview.copilot.mapper.references.ReferenceHybridMapper;
import com.interview.copilot.model.references.ReferenceRecall;
import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.response.references.ReferenceExcerptResponse;
import com.interview.copilot.response.references.ReferenceRankingResponse;
import com.interview.copilot.service.references.ReferenceContextService;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class ReferenceContextServiceImpl implements ReferenceContextService {
    private static final Logger LOG = LoggerFactory.getLogger(ReferenceContextServiceImpl.class);
    private final ReferenceHybridMapper mapper;
    private final org.springframework.transaction.support.TransactionTemplate transaction;
    private final Cache<Key, ReferenceContextEntity> cache = Caffeine.newBuilder().maximumWeight(8388608)
            .weigher((Key key, ReferenceContextEntity row) -> 512 + 2 * (row.text().length() + row.introduction().length() + row.sectionPath().length()))
            .expireAfterWrite(Duration.ofMinutes(10)).recordStats().build();
    public ReferenceContextServiceImpl(ReferenceHybridMapper mapper, org.springframework.transaction.PlatformTransactionManager manager, io.micrometer.core.instrument.MeterRegistry registry) {
        this.mapper = mapper;
        this.transaction = new org.springframework.transaction.support.TransactionTemplate(manager);
        this.transaction.setReadOnly(true);
        io.micrometer.core.instrument.binder.cache.CaffeineCacheMetrics.monitor(registry, cache, "reference-context");
        io.micrometer.core.instrument.Gauge.builder("reference.cache.estimated.bytes", cache,
                value -> value.policy().eviction().flatMap(e -> e.weightedSize().isPresent()
                        ? java.util.Optional.of((double) e.weightedSize().getAsLong()) : java.util.Optional.empty()).orElse(0.0)).register(registry);
    }
    public void invalidate(long user, String document) {
        Runnable clear = () -> cache.asMap().keySet().removeIf(key -> key.user() == user && key.document().equals(document));
        if (org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive()) {
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(new org.springframework.transaction.support.TransactionSynchronization() {
                @Override public void afterCommit() { clear.run(); }
            });
        } else clear.run();
    }
    public List<ReferenceExcerptResponse> expand(long user, List<ReferenceScopeEntity> scope,
            List<ReferenceRecall.Fused> fused, ReferencePolicy policy, OperationContext observation) {
        if (fused.isEmpty()) return List.of();
        var span = observation == null ? null : observation.child("pg");
        Map<Key, ReferenceContextEntity> rows = new HashMap<>();
        try {
            if (policy.cacheEnabled()) {
                cache.policy().eviction().ifPresent(value -> value.setMaximum(policy.cacheWeightBytes()));
                for (var item : fused) { var key = key(user, item); var row = cache.getIfPresent(key); if (row != null) rows.put(key, row); }
            }
            var missing = fused.stream().filter(item -> !rows.containsKey(key(user, item))).map(ReferenceRecall.Fused::contextId).toList();
            if (!missing.isEmpty()) for (var row : transaction.execute(status -> {
                mapper.timeout("1000");
                return mapper.contexts(user, scope, missing);
            })) {
                var key = new Key(user, row.documentId(), row.revision(), row.contextId());
                rows.put(key, row);
                if (policy.cacheEnabled()) cache.put(key, row);
            }
            if (span != null) span.finish("retrieval.parent_lookup", "success", Map.of("cacheHits", fused.size() - missing.size(), "fragmentCount", rows.size()));
        } catch (RuntimeException error) {
            if (error instanceof java.util.concurrent.CancellationException || Thread.currentThread().isInterrupted())
                throw new java.util.concurrent.CancellationException();
            LOG.error("Parent context lookup failed user={}", user, error);
            if (span != null) span.finish("retrieval.parent_lookup", "degraded", Map.of());
        }
        return pack(user, scope, fused, rows, observation);
    }
    private List<ReferenceExcerptResponse> pack(long user, List<ReferenceScopeEntity> scope, List<ReferenceRecall.Fused> fused,
            Map<Key, ReferenceContextEntity> rows, OperationContext observation) {
        var span = observation == null ? null : observation.child("pg");
        List<ReferenceExcerptResponse> result = new ArrayList<>();
        int remaining = 4800;
        for (var item : fused) {
            var document = scope.stream().filter(d -> d.documentId().equals(item.documentId()) && d.revision() == item.revision()).findFirst();
            if (document.isEmpty()) continue;
            var row = rows.get(key(user, item));
            String title = row == null ? "" : ReferenceText.prefix(row.sectionPath(), 158) + "\n";
            String body = row == null ? item.matches().getFirst().text() : row.text();
            String text = title + body;
            String expansion = row == null ? "child" : row.split() ? "partial" : "parent";
            if (row != null) {
                String introduction = introduction(row.introduction());
                if (!introduction.isBlank() && text.length() + introduction.length() + 2 <= 2000) text += "\n\n" + introduction;
            }
            if (text.length() > remaining) {
                text = item.matches().getFirst().text();
                expansion = "child";
            }
            if (text.length() > remaining || text.length() > 2000) continue;
            remaining -= text.length();
            result.add(new ReferenceExcerptResponse("platform", item.documentId(), item.revision(), document.get().name(), document.get().kind(),
                    Long.toString(item.contextId()), text, row == null ? 0 : row.paragraphStart(), row == null ? 0 : row.paragraphEnd(),
                    row == null ? "" : row.sectionPath(), item.matches().stream().map(c -> Long.toString(c.chunkId())).distinct().toList(), expansion,
                    new ReferenceRankingResponse(item.bm25Rank(), item.vectorRank(), item.bm25Score(), item.vectorScore(), item.rrfScore())));
        }
        if (span != null) span.finish("retrieval.context_pack", "success", Map.of("fragmentCount", result.size()));
        return List.copyOf(result);
    }
    private String introduction(String value) {
        String shortText = ReferenceText.prefix(value, 240);
        if (value.length() < 240) return shortText;
        for (int i = shortText.length() - 1; i >= 0; i--) if ("。！？.!?\n".indexOf(shortText.charAt(i)) >= 0) return shortText.substring(0, i + 1);
        return "";
    }
    private Key key(long user, ReferenceRecall.Fused item) { return new Key(user, item.documentId(), item.revision(), item.contextId()); }
    private record Key(long user, String document, int revision, long context) {}
}
