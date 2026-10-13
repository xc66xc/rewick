package com.interview.copilot.service.impl.references;

import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.response.references.ReferenceRetrievalResponse;
import com.interview.copilot.service.platform.DesktopSettingsService;
import com.interview.copilot.service.references.ReferenceSearchService;
import com.interview.copilot.service.references.ReferenceStorageService;
import com.interview.copilot.service.references.ReferenceHybridService;
import com.interview.copilot.service.usage.UsageService;
import com.interview.copilot.validation.ai.LlmRequestPolicy;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class ReferenceSearchServiceImpl implements ReferenceSearchService {
    private static final Logger LOG = LoggerFactory.getLogger(ReferenceSearchServiceImpl.class);
    private final DesktopSettingsService desktop;
    private final ReferenceStorageService repository;
    private final UsageService usage;
    private final ReferenceHybridService hybrid;
    private final com.interview.copilot.service.references.ReferenceCancellationService cancellations;
    public ReferenceSearchServiceImpl(ReferenceStorageService repository, UsageService usage,
            ReferenceHybridService hybrid, DesktopSettingsService desktop, com.interview.copilot.service.references.ReferenceCancellationService cancellations) {
        this.desktop = desktop;
        this.repository = repository;
        this.usage = usage;
        this.hybrid = hybrid;
        this.cancellations = cancellations;
    }
    public ReferenceRetrievalResponse search(long user, String requestId, String query, List<UUID> ids) {
        return search(user, requestId, query, ids, null);
    }
    public ReferenceRetrievalResponse search(long user, String requestId, String query, List<UUID> ids, OperationContext context) {
        try { return retrieve(user, requestId, query, ids, context); }
        catch (RuntimeException error) {
            String outcome = error instanceof java.util.concurrent.CancellationException ? "cancelled"
                    : error instanceof com.interview.copilot.exception.ApiException ? "rejected" : "error";
            if (context != null) context.finish("retrieval.rag", outcome, Map.of());
            throw error;
        }
    }
    private ReferenceRetrievalResponse retrieve(long user, String requestId, String query, List<UUID> ids, OperationContext context) {
        desktop.requireLocal(user);
        if (ids.isEmpty()) {
            if (context != null) context.finish("retrieval.rag", "success", Map.of("fragmentCount", 0));
            return new ReferenceRetrievalResponse("disabled", "当前环境未选择参考资料。", List.of(), null);
        }
        repository.requireAll(user, ids.stream().map(UUID::toString).toList());
        String identifier = LlmRequestPolicy.requestId(requestId);
        try (var work = cancellations.register(user, identifier); var lease = usage.start(user, identifier, "knowledge")) {
            lease.watch(() -> cancellations.cancel(user, identifier));
            try {
                var result = hybrid.retrieve(user, query, ids.stream().map(UUID::toString).toList(), context);
                if (result.status().equals("degraded")) lease.fail(); else lease.complete();
                if (context != null) context.finish("retrieval.rag", result.status().equals("degraded") ? "degraded" : "success", Map.of("fragmentCount", result.excerpts().size()));
                return result;
            } catch (RuntimeException error) {
                if (error instanceof java.util.concurrent.CancellationException) lease.cancel(); else lease.fail();
                LOG.error("Hybrid reference request failed user={} request={}", user, requestId, error);
                if (context != null) context.finish("retrieval.rag", error instanceof java.util.concurrent.CancellationException ? "cancelled" : "error", Map.of());
                if (error instanceof com.interview.copilot.exception.ApiException || error instanceof java.util.concurrent.CancellationException) throw error;
                return new ReferenceRetrievalResponse("degraded", "资料混合检索暂不可用，继续生成回答。", List.of(), null);
            }
        }
    }
}
