package com.interview.copilot.service.impl.references;

import com.interview.copilot.common.references.ReferenceFusion;
import com.interview.copilot.mapper.references.ReferenceMapper;
import com.interview.copilot.mapper.references.ReferenceHybridMapper;
import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.model.references.ReferenceRecall;
import com.interview.copilot.response.references.ReferenceHybridResponse;
import com.interview.copilot.response.references.ReferenceRetrievalResponse;
import com.interview.copilot.service.references.ReferenceHybridService;
import com.interview.copilot.service.references.ReferenceParallelService;
import com.interview.copilot.service.references.ReferenceContextService;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Map;

@Service
public class ReferenceHybridServiceImpl implements ReferenceHybridService {
    private final ReferenceMapper policyMapper;
    private final ReferenceHybridMapper mapper;
    private final ReferenceParallelService parallel;
    private final ReferenceContextService contexts;
    private final ReferenceFusion fusion = new ReferenceFusion();
    public ReferenceHybridServiceImpl(ReferenceMapper policyMapper, ReferenceHybridMapper mapper,
            ReferenceParallelService parallel, ReferenceContextService contexts) {
        this.policyMapper = policyMapper;
        this.mapper = mapper;
        this.parallel = parallel;
        this.contexts = contexts;
    }
    public ReferenceRetrievalResponse retrieve(long user, String query, List<String> ids, OperationContext observation) {
        var policy = policyMapper.policy();
        if (!policy.hybridEnabled()) return new ReferenceRetrievalResponse("disabled", "平台参考资料混合检索已停用。", List.of(), null);
        var scope = mapper.scope(user, ids);
        if (scope.isEmpty()) return new ReferenceRetrievalResponse("empty", "所选资料尚未建立新索引，请重新上传或重建 Markdown/Word 资料。", List.of(), null);
        var pair = parallel.recall(user, scope, query, policy, observation);
        var span = observation == null ? null : observation.child("pg");
        var ranked = fusion.fuse(pair.bm25().candidates(), pair.vector().candidates(), policy.rrfConstant());
        if (span != null) span.finish("retrieval.fusion", "success", Map.of("fragmentCount", ranked.size()));
        var checked = mapper.scope(user, ids);
        var valid = scope.stream().filter(checked::contains).toList();
        ranked = ranked.stream().filter(item -> valid.stream().anyMatch(d -> d.documentId().equals(item.documentId()) && d.revision() == item.revision())).toList();
        var excerpts = contexts.expand(user, valid, ranked, policy, observation);
        if (Thread.currentThread().isInterrupted()) throw new java.util.concurrent.CancellationException();
        boolean degraded = pair.bm25().status().equals("degraded") || pair.vector().status().equals("degraded")
                || valid.size() != scope.size() || excerpts.stream().anyMatch(e -> e.contextExpansion().equals("child"));
        String message = (pair.bm25().status().equals("degraded") ? "BM25 关键词检索降级。" : "")
                + (pair.vector().status().equals("degraded") ? "向量检索降级。" : "")
                + (valid.size() != scope.size() ? "部分资料状态或版本已变更，已移除其结果。" : "")
                + (excerpts.stream().anyMatch(e -> e.contextExpansion().equals("child")) ? "部分父上下文未完整扩展，已保留命中子片段。" : "");
        var details = new ReferenceHybridResponse(branch(pair.bm25()), branch(pair.vector()),
                new ReferenceHybridResponse.Fusion("rrf", policy.rrfConstant(), excerpts.size()));
        return new ReferenceRetrievalResponse(degraded ? "degraded" : excerpts.isEmpty() ? "empty" : "ready", message, excerpts, details);
    }
    private ReferenceHybridResponse.Branch branch(ReferenceRecall.Branch value) {
        return new ReferenceHybridResponse.Branch(value.status(), value.candidates().size(), value.durationMs());
    }
}
