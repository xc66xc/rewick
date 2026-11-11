package com.interview.copilot.service.impl.references;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import com.interview.copilot.entity.references.ReferenceScopeEntity;
import com.interview.copilot.model.references.ReferenceQueryPlan;
import com.interview.copilot.model.references.ReferenceRecall;
import com.interview.copilot.model.references.ReferenceRerank;
import com.interview.copilot.service.references.ReferenceContextService;
import com.interview.copilot.service.references.ReferenceParallelService;
import com.interview.copilot.service.references.ReferenceQueryService;
import com.interview.copilot.service.references.ReferenceRerankService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.stream.IntStream;

class ReferenceHybridServiceTest {
    @Test void retrieve_cachedParent_stillUsesCurrentKindAndRejectsDisabledDocument() throws Exception {
        var fixture = new Fixture();
        fixture.rerank("disabled", false);
        var mapper = mock(com.interview.copilot.mapper.references.ReferenceHybridMapper.class);
        var manager = mock(org.springframework.transaction.PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenReturn(new org.springframework.transaction.support.SimpleTransactionStatus());
        var json = new ObjectMapper();
        ObjectNode data = json.valueToTree(ReferencePolicy.defaults());
        data.put("cacheEnabled", true);
        when(fixture.queries.prepare()).thenReturn(ReferenceQueryPlan.start(json.treeToValue(data, ReferencePolicy.class), null));
        var hit = new ReferenceCandidateEntity("doc1", 1, 1, 1, 1, "child", 1, 0);
        var branch = new ReferenceRecall.Branch("ready", List.of(hit), 1);
        when(fixture.parallel.recall(anyLong(), anyList(), anyString(), any(ReferenceQueryPlan.class), any()))
                .thenReturn(new ReferenceRecall.Pair(branch, branch));
        when(mapper.contexts(anyLong(), anyList(), anyList())).thenReturn(List.of(
                new com.interview.copilot.entity.references.ReferenceContextEntity("doc1", 1, 1, "完整父正文", "缓存", "", 1, 2, false)));
        var contexts = new ReferenceContextServiceImpl(mapper, manager, new io.micrometer.core.instrument.simple.SimpleMeterRegistry());
        var service = new ReferenceHybridServiceImpl(fixture.queries, fixture.parallel, contexts, fixture.rerank);

        assertThat(service.retrieve(1, "query", List.of("selection"), null).excerpts().getFirst().text()).contains("完整父正文");
        service.retrieve(1, "query", List.of("selection"), null);
        verify(mapper, org.mockito.Mockito.times(1)).contexts(anyLong(), anyList(), anyList());
        when(fixture.queries.scope(anyLong(), anyList(), any())).thenReturn(List.of(new ReferenceScopeEntity("doc1", 1, "name", "personal")));
        assertThat(service.retrieve(1, "query", List.of("selection"), null).excerpts().getFirst().kind()).isEqualTo("personal");
        when(fixture.queries.scope(anyLong(), anyList(), any())).thenReturn(List.of());
        assertThat(service.retrieve(1, "query", List.of("selection"), null).excerpts()).isEmpty();
    }

    @Test void retrieve_disabledRerank_returnsConfiguredRrfPoolAndFullUnionCounts() throws Exception {
        var fixture = new Fixture();
        fixture.rerank("disabled", false);

        var response = fixture.service.retrieve(1, "query", List.of("selection"), null);

        assertThat(fixture.selected()).extracting(ReferenceRecall.Fused::contextId).containsExactly(1L, 5L, 2L, 6L, 3L, 7L);
        assertThat(response.hybrid().fusion().candidateCount()).isEqualTo(8);
        assertThat(response.hybrid().fusion().selectedCount()).isEqualTo(6);
        assertThat(response.hybrid().fusion().topN()).isEqualTo(6);
        assertThat(response.hybrid().fusion().resultCount()).isZero();
        assertThat(response.hybrid().rerank().candidateCount()).isZero();
        assertThat(response.hybrid().rerank().resultCount()).isEqualTo(6);
        verify(fixture.queries, org.mockito.Mockito.times(2)).scope(anyLong(), anyList(), any());
    }
    @Test void retrieve_inputLimitFallback_explainsDegradedStatus() throws Exception {
        var fixture = new Fixture();
        when(fixture.rerank.rank(anyString(), anyList(), any(), anyLong(), any())).thenAnswer(call ->
                new ReferenceRerank.Result(call.getArgument(1), true, "skipped", "input_limit", "qwen3-rerank", 0));

        var response = fixture.service.retrieve(1, "query", List.of("selection"), null);

        assertThat(response.status()).isEqualTo("degraded");
        assertThat(response.message()).contains("重排序输入超限", "RRF");
        assertThat(response.hybrid().fusion().selectedCount()).isEqualTo(6);
        assertThat(response.hybrid().rerank().candidateCount()).isZero();
        assertThat(fixture.selected()).hasSize(2);
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(ints = {0, 1})
    void retrieve_zeroOrOneCandidate_skipsHttpAndReportsZeroSubmitted(int count) throws Exception {
        var fixture = new Fixture();
        var branch = new ReferenceRecall.Branch(count == 0 ? "empty" : "ready", fixture.branch(1).candidates().subList(0, count), 0);
        when(fixture.parallel.recall(anyLong(), anyList(), anyString(), any(ReferenceQueryPlan.class), any()))
                .thenReturn(new ReferenceRecall.Pair(branch, new ReferenceRecall.Branch("empty", List.of(), 0)));
        when(fixture.rerank.rank(anyString(), anyList(), any(), anyLong(), any())).thenAnswer(call ->
                new ReferenceRerank.Result(call.getArgument(1), true, "skipped", null, "qwen3-rerank", 0, 0));

        var response = fixture.service.retrieve(1, "query", List.of("selection"), null);

        assertThat(response.hybrid().fusion().selectedCount()).isEqualTo(count);
        assertThat(response.hybrid().rerank().candidateCount()).isZero();
        assertThat(response.hybrid().rerank().resultCount()).isEqualTo(count);
    }
    @Test void retrieve_enabledFailure_stillAppliesRerankTopN() throws Exception {
        var fixture = new Fixture();
        fixture.rerank("degraded", true);

        var response = fixture.service.retrieve(1, "query", List.of("selection"), null);

        assertThat(fixture.selected()).extracting(ReferenceRecall.Fused::contextId).containsExactly(1L, 5L);
        assertThat(response.status()).isEqualTo("degraded");
        assertThat(response.hybrid().rerank().candidateCount()).isEqualTo(6);
        assertThat(response.hybrid().rerank().resultCount()).isEqualTo(2);
    }
    @Test void retrieve_snapshotUnavailable_keepsBm25ButCapsFailureAtRerankTopN() throws Exception {
        var fixture = new Fixture();
        var json = new ObjectMapper();
        ObjectNode data = json.valueToTree(ReferencePolicy.defaults());
        data.put("rrfTopN", 4);
        when(fixture.queries.prepare()).thenReturn(ReferenceQueryPlan.start(json.treeToValue(data, ReferencePolicy.class), null));
        when(fixture.parallel.recall(anyLong(), anyList(), anyString(), any(ReferenceQueryPlan.class), any()))
                .thenReturn(new ReferenceRecall.Pair(fixture.branch(1), new ReferenceRecall.Branch("degraded", List.of(), 0)));
        when(fixture.rerank.rank(anyString(), anyList(), any(), anyLong(), any())).thenAnswer(call ->
                new ReferenceRerank.Result(call.getArgument(1), false, "degraded", "unavailable", "", 0));

        var response = fixture.service.retrieve(1, "query", List.of("selection"), null);

        assertThat(fixture.selected()).extracting(ReferenceRecall.Fused::contextId).containsExactly(1L, 2L);
        assertThat(response.status()).isEqualTo("degraded");
        assertThat(response.hybrid().bm25().candidateCount()).isEqualTo(4);
        assertThat(response.hybrid().fusion().selectedCount()).isEqualTo(4);
        assertThat(response.hybrid().rerank().candidateCount()).isZero();
        assertThat(response.hybrid().rerank().resultCount()).isEqualTo(2);
        verify(fixture.queries, org.mockito.Mockito.times(2)).scope(anyLong(), anyList(), any());
    }
    @Test void retrieve_documentRemovedDuringRerank_fillsOnlyFromFrozenPool() throws Exception {
        var fixture = new Fixture();
        when(fixture.queries.scope(anyLong(), anyList(), any())).thenReturn(fixture.scope, fixture.scope,
                fixture.scope.stream().filter(row -> !row.documentId().equals("doc7")).toList());
        when(fixture.rerank.rank(anyString(), anyList(), any(), anyLong(), any())).thenAnswer(call -> {
            List<ReferenceRecall.Fused> pool = call.getArgument(1);
            var reversed = new ArrayList<>(pool);
            Collections.reverse(reversed);
            return new ReferenceRerank.Result(IntStream.range(0, reversed.size())
                    .mapToObj(index -> reversed.get(index).withRerank(index + 1, 1 - index * 0.1)).toList(),
                    true, "ready", "", "qwen3-rerank", 2, pool.size());
        });

        var response = fixture.service.retrieve(1, "query", List.of("selection"), null);

        assertThat(fixture.selected()).extracting(ReferenceRecall.Fused::contextId).containsExactly(3L, 6L);
        assertThat(fixture.selected().getFirst().rerankRank()).isEqualTo(2);
        assertThat(response.hybrid().rerank().candidateCount()).isEqualTo(6);
    }
    @Test void retrieve_revisionChangesBeforePoolSelection_removesOldCandidatesBeforeLimiting() throws Exception {
        var fixture = new Fixture();
        when(fixture.queries.scope(anyLong(), anyList(), any())).thenReturn(fixture.scope,
                fixture.scope.stream().map(row -> row.documentId().equals("doc1")
                        ? new ReferenceScopeEntity("doc1", 2, "updated", "technical") : row).toList());
        fixture.rerank("disabled", false);

        var response = fixture.service.retrieve(1, "query", List.of("selection"), null);

        assertThat(fixture.selected()).extracting(ReferenceRecall.Fused::contextId).containsExactly(5L, 2L, 6L, 3L, 7L, 4L);
        assertThat(response.status()).isEqualTo("degraded");
    }
    private static class Fixture {
        final ReferenceQueryService queries = mock(ReferenceQueryService.class);
        final ReferenceParallelService parallel = mock(ReferenceParallelService.class);
        final ReferenceContextService contexts = mock(ReferenceContextService.class);
        final ReferenceRerankService rerank = mock(ReferenceRerankService.class);
        final List<ReferenceScopeEntity> scope = IntStream.rangeClosed(1, 8)
                .mapToObj(index -> new ReferenceScopeEntity("doc" + index, 1, "name", "technical")).toList();
        final ReferenceHybridServiceImpl service = new ReferenceHybridServiceImpl(queries, parallel, contexts, rerank);
        Fixture() throws Exception {
            var json = new ObjectMapper();
            ObjectNode data = json.valueToTree(ReferencePolicy.defaults());
            data.put("rrfTopN", 6);
            when(queries.prepare()).thenReturn(ReferenceQueryPlan.start(json.treeToValue(data, ReferencePolicy.class), null));
            when(queries.scope(anyLong(), anyList(), any())).thenReturn(scope);
            when(parallel.recall(anyLong(), anyList(), anyString(), any(ReferenceQueryPlan.class), any()))
                    .thenReturn(new ReferenceRecall.Pair(branch(1), branch(5)));
            when(contexts.expand(anyLong(), anyList(), anyList(), any(ReferenceQueryPlan.class), any())).thenReturn(List.of());
        }
        void rerank(String status, boolean enabled) {
            when(rerank.rank(anyString(), anyList(), any(), anyLong(), any())).thenAnswer(call -> {
                List<ReferenceRecall.Fused> pool = call.getArgument(1);
                return new ReferenceRerank.Result(pool, enabled, status,
                        enabled ? "timeout" : "", "", 0, enabled ? pool.size() : 0);
            });
        }
        @SuppressWarnings("unchecked")
        List<ReferenceRecall.Fused> selected() {
            var captured = (ArgumentCaptor<List<ReferenceRecall.Fused>>) (ArgumentCaptor<?>) ArgumentCaptor.forClass(List.class);
            verify(contexts).expand(anyLong(), anyList(), captured.capture(), any(ReferenceQueryPlan.class), any());
            return captured.getValue();
        }
        private ReferenceRecall.Branch branch(int start) {
            return new ReferenceRecall.Branch("ready", IntStream.range(start, start + 4)
                    .mapToObj(index -> new ReferenceCandidateEntity("doc" + index, 1, index, index, index, "hit", 1, 0)).toList(), 1);
        }
    }
}
