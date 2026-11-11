package com.interview.copilot.service.impl.references;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import com.interview.copilot.exception.ai.ProviderFailure;
import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.model.operations.OperationEvent;
import com.interview.copilot.model.platform.PlatformConfig;
import com.interview.copilot.model.platform.PlatformPolicy;
import com.interview.copilot.model.platform.PlatformSnapshot;
import com.interview.copilot.model.references.ReferenceRecall;
import com.interview.copilot.util.rerank.BailianRerankClient;
import com.interview.copilot.util.rerank.BailianRerankProtocol;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CancellationException;
import java.util.stream.Stream;

class ReferenceRerankServiceTest {
    private final BailianRerankClient client = mock(BailianRerankClient.class);
    private final ReferenceRerankServiceImpl service = new ReferenceRerankServiceImpl(client);
    private final List<ReferenceRecall.Fused> candidates = List.of(candidate(1), candidate(2), candidate(3));

    @Test
    void rank_snapshotUnavailable_keepsRrfAndDoesNotReadAnotherSnapshot() {
        var result = service.rank("question", candidates, null, Long.MAX_VALUE, null);

        assertThat(result.enabled()).isFalse();
        assertThat(result.status()).isEqualTo("degraded");
        assertThat(result.reason()).isEqualTo("unavailable");
        assertThat(result.submittedCount()).isZero();
        assertThat(result.candidates()).containsExactlyElementsOf(candidates);
        verifyNoInteractions(client);
    }

    @Test
    void rank_disabled_preservesWholeRPoolWithoutProviderCall() {
        var result = service.rank("question", candidates, snapshot(false), Long.MAX_VALUE, null);

        assertThat(result.enabled()).isFalse();
        assertThat(result.status()).isEqualTo("disabled");
        assertThat(result.submittedCount()).isZero();
        assertThat(result.candidates()).containsExactlyElementsOf(candidates);
        verifyNoInteractions(client);
    }

    @Test
    void rank_singleOrEmptyCandidate_skipsEnabledService() {
        for (var pool : List.of(List.<ReferenceRecall.Fused>of(), List.of(candidate(1)))) {
            var result = service.rank("question", pool, snapshot(true), Long.MAX_VALUE, null);

            assertThat(result.enabled()).isTrue();
            assertThat(result.status()).isEqualTo("skipped");
            assertThat(result.submittedCount()).isZero();
            assertThat(result.candidates()).containsExactlyElementsOf(pool);
        }
        verifyNoInteractions(client);
    }

    @ParameterizedTest
    @ValueSource(strings = {"qwen3-rerank", "qwen3.7-text-rerank"})
    void rank_validRanking_returnsWholePoolAndPreservesOriginalScores(String model) {
        when(client.rank(any(), any(), any(), anyLong(), any())).thenAnswer(call -> {
            call.<Runnable>getArgument(4).run();
            return List.of(new BailianRerankProtocol.Score(2, 0.9), new BailianRerankProtocol.Score(0, 0.8),
                    new BailianRerankProtocol.Score(1, 0.7));
        });

        List<OperationEvent> events = new ArrayList<>();
        var observation = OperationContext.start(1, null, null, null, null, "pg", "answer-model", events::add);

        var result = service.rank("question", candidates, snapshot(true, model), Long.MAX_VALUE, observation);

        assertThat(result.status()).isEqualTo("ready");
        assertThat(result.submittedCount()).isEqualTo(3);
        assertThat(result.candidates()).extracting(ReferenceRecall.Fused::contextId).containsExactly(3L, 1L, 2L);
        assertThat(result.candidates().getFirst().rerankRank()).isEqualTo(1);
        assertThat(result.candidates().getFirst().rerankScore()).isEqualTo(0.9);
        assertThat(result.candidates().getFirst().rrfScore()).isEqualTo(candidates.get(2).rrfScore());
        assertThat(result.candidates().getFirst().matches()).isSameAs(candidates.get(2).matches());
        assertThat(events).singleElement().satisfies(event -> {
            assertThat(event.stage()).isEqualTo("retrieval.rerank");
            assertThat(event.outcome()).isEqualTo("success");
            assertThat(event.model()).isEqualTo(model);
        });
    }

    @ParameterizedTest
    @MethodSource("modelFailures")
    void rank_providerFailure_fallsBackToOriginalRPoolAndRecordsExplicitReason(String model, String failure) {
        int submitted = List.of("queue_full", "unavailable").contains(failure) ? 0 : candidates.size();
        when(client.rank(any(), any(), any(), anyLong(), any())).thenAnswer(call -> {
            if (submitted > 0) call.<Runnable>getArgument(4).run();
            throw new ProviderFailure(failure, "sanitized failure");
        });
        List<OperationEvent> events = new ArrayList<>();
        var observation = OperationContext.start(1, null, null, null, null, "pg", "answer-model", events::add);

        var result = service.rank("private question", candidates, snapshot(true, model), Long.MAX_VALUE, observation);

        String reason = "http_error".equals(failure) ? "provider_error" : failure;
        assertThat(result.enabled()).isTrue();
        assertThat(result.status()).isEqualTo("degraded");
        assertThat(result.reason()).isEqualTo(reason);
        assertThat(result.submittedCount()).isEqualTo(submitted);
        assertThat(result.candidates()).containsExactlyElementsOf(candidates);
        assertThat(events).singleElement().satisfies(event -> {
            assertThat(event.stage()).isEqualTo("retrieval.rerank");
            assertThat(event.outcome()).isEqualTo("timeout".equals(reason) ? "timeout" : "degraded");
            assertThat(event.reason()).isEqualTo(reason);
            assertThat(event.providerType()).isEqualTo("rerank");
            assertThat(event.model()).isEqualTo(model);
            assertThat(event.metadata()).containsEntry("platformVersion", 7L);
            assertThat(event.metadata()).containsEntry("candidateCount", submitted);
            assertThat(event.toString()).doesNotContain("private question", "candidate text", "private-key");
        });
    }

    @Test
    void rank_queryTooLong_skipsAndKeepsOriginalOrder() {
        var result = service.rank("q".repeat(3501), candidates, snapshot(true), Long.MAX_VALUE, null);

        assertThat(result.status()).isEqualTo("skipped");
        assertThat(result.reason()).isEqualTo("input_limit");
        assertThat(result.enabled()).isTrue();
        assertThat(result.submittedCount()).isZero();
        assertThat(result.candidates()).containsExactlyElementsOf(candidates);
        verifyNoInteractions(client);
    }

    @Test
    void rank_wrappedCancellation_propagatesAndRecordsCancelled() {
        when(client.rank(any(), any(), any(), anyLong(), any())).thenThrow(new IllegalStateException(new CancellationException()));
        List<OperationEvent> events = new ArrayList<>();
        var observation = OperationContext.start(1, null, null, null, null, "pg", "", events::add);

        assertThatThrownBy(() -> service.rank("question", candidates, snapshot(true), Long.MAX_VALUE, observation))
                .isInstanceOf(CancellationException.class);

        assertThat(events).singleElement().satisfies(event -> assertThat(event.outcome()).isEqualTo("cancelled"));
    }

    @Test
    void rank_deadlineExpiresBeforeSubscription_recordsZeroSubmittedCandidates() {
        when(client.rank(any(), any(), any(), anyLong(), any())).thenThrow(new ProviderFailure("timeout", "budget used"));
        List<OperationEvent> events = new ArrayList<>();
        var observation = OperationContext.start(1, null, null, null, null, "pg", "", events::add);

        var result = service.rank("question", candidates, snapshot(true), System.nanoTime() - 1, observation);

        assertThat(result.submittedCount()).isZero();
        assertThat(result.reason()).isEqualTo("timeout");
        assertThat(events).singleElement().satisfies(event -> assertThat(event.metadata()).containsEntry("candidateCount", 0));
    }

    private PlatformSnapshot snapshot(boolean enabled) {
        return snapshot(enabled, "qwen3-rerank");
    }

    private PlatformSnapshot snapshot(boolean enabled, String model) {
        var provider = new PlatformConfig.Provider("rerank", "Rerank", "rerank",
                "https://provider.invalid" + BailianRerankProtocol.PATH, true, true, null);
        var config = new PlatformConfig(7, List.of(provider), List.of(), "", new PlatformConfig.Asr(false, "", ""),
                null, null, "", new PlatformConfig.Rerank(enabled, "rerank", model, 1500));
        return new PlatformSnapshot(config, Map.of("rerank", "private-key"), PlatformPolicy.from(new ProviderProperties()));
    }

    private static Stream<Arguments> modelFailures() {
        return Stream.of("qwen3-rerank", "qwen3.7-text-rerank").flatMap(model ->
                Stream.of("timeout", "queue_full", "protocol_error", "http_error", "unavailable")
                        .map(failure -> Arguments.of(model, failure)));
    }

    private ReferenceRecall.Fused candidate(long id) {
        var chunk = new ReferenceCandidateEntity("document", 1, id, id, (int) id, "candidate text", 0.8, 0);
        return new ReferenceRecall.Fused("document", 1, id, (int) id, 1, 1, 0.8, 0.8, 0.03, List.of(chunk));
    }
}
