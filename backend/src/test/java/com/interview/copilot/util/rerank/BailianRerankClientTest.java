package com.interview.copilot.util.rerank;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.exception.ai.ProviderFailure;
import com.interview.copilot.model.rerank.RerankEndpoint;
import com.interview.copilot.util.ai.ProviderHttpClient;

import org.junit.jupiter.api.Test;

import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

class BailianRerankClientTest {
    private final ProviderHttpClient http = mock(ProviderHttpClient.class);
    private final BailianRerankClient client = new BailianRerankClient(http);
    private final RerankEndpoint endpoint = new RerankEndpoint(true, "https://provider.invalid" + BailianRerankProtocol.PATH,
            "private-key", "qwen3-rerank", 5000);

    @Test
    void rank_expiredDeadline_doesNotSubscribeToHttp() {
        var submitted = new AtomicInteger();
        assertThatThrownBy(() -> client.rank(endpoint, "question", List.of("one", "two"), System.nanoTime() - 1,
                submitted::incrementAndGet))
                .isInstanceOfSatisfying(ProviderFailure.class, error -> assertThat(error.reason()).isEqualTo("timeout"));
        assertThat(submitted).hasValue(0);
        org.mockito.Mockito.verifyNoInteractions(http);
    }

    @Test
    void rank_remainingDeadlineShorterThanConfig_cancelsHttpAtRemainingBudget() {
        var cancelled = new CountDownLatch(1);
        when(http.json(any(), any(), any())).thenReturn(Mono.<JsonNode>never().doOnCancel(cancelled::countDown));
        long started = System.nanoTime();

        assertThatThrownBy(() -> client.rank(endpoint, "question", List.of("one", "two"), started + 200_000_000))
                .hasCauseInstanceOf(java.util.concurrent.TimeoutException.class);

        assertThat(cancelled.getCount()).isZero();
        assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(2));
    }

    @Test
    void rank_fourActiveCalls_fifthDoesNotQueueAndCancellationReleasesCapacity() throws Exception {
        var subscribed = new CountDownLatch(4);
        var cancelled = new CountDownLatch(4);
        when(http.json(any(), any(), any())).thenReturn(Mono.<JsonNode>never()
                .doOnSubscribe(subscription -> subscribed.countDown()).doOnCancel(cancelled::countDown));
        var workers = Executors.newFixedThreadPool(4);
        List<Future<?>> futures = new ArrayList<>();
        try {
            for (int index = 0; index < 4; index++) futures.add(workers.submit(() ->
                    client.rank(endpoint, "question", List.of("one", "two"), System.nanoTime() + TimeUnit.SECONDS.toNanos(10))));
            assertThat(subscribed.await(2, TimeUnit.SECONDS)).isTrue();

            var fifthSubmitted = new AtomicInteger();
            assertThatThrownBy(() -> client.rank(endpoint, "question", List.of("one", "two"), Long.MAX_VALUE,
                    fifthSubmitted::incrementAndGet))
                    .isInstanceOfSatisfying(ProviderFailure.class, error -> assertThat(error.reason()).isEqualTo("queue_full"));
            assertThat(fifthSubmitted).hasValue(0);
        } finally {
            futures.forEach(future -> future.cancel(true));
            workers.shutdownNow();
            assertThat(workers.awaitTermination(2, TimeUnit.SECONDS)).isTrue();
        }
        assertThat(cancelled.await(2, TimeUnit.SECONDS)).isTrue();
        JsonNode response = new ObjectMapper().readTree("{\"output\":{\"results\":[{\"index\":0,\"relevance_score\":1},{\"index\":1,\"relevance_score\":0}]}}");
        when(http.json(any(), any(), any())).thenReturn(Mono.just(response));
        assertThat(client.rank(endpoint, "question", List.of("one", "two"), Long.MAX_VALUE)).hasSize(2);
    }

    @Test
    void rank_interruptedThread_propagatesCancellationWithoutHttp() {
        Thread.currentThread().interrupt();
        try {
            assertThatThrownBy(() -> client.rank(endpoint, "question", List.of("one", "two"), Long.MAX_VALUE))
                    .isInstanceOf(CancellationException.class);
        } finally {
            Thread.interrupted();
        }
        org.mockito.Mockito.verifyNoInteractions(http);
    }

    @Test
    void rank_httpSubscription_marksSubmittedOnceBeforeRequestAndRetainsCountOnProviderError() {
        var submitted = new AtomicInteger();
        when(http.json(any(), any(), any())).thenReturn(Mono.defer(() -> {
            assertThat(submitted).hasValue(1);
            return Mono.error(ProviderFailure.http(503));
        }));

        assertThatThrownBy(() -> client.rank(endpoint, "question", List.of("one", "two"), Long.MAX_VALUE,
                submitted::incrementAndGet)).isInstanceOf(ProviderFailure.class);

        assertThat(submitted).hasValue(1);
    }

    @Test
    void rank_unregisteredModel_rejectsBeforeSubmissionCallback() {
        var invalid = new RerankEndpoint(true, endpoint.url(), endpoint.apiKey(), "unknown-model", 1500);
        var submitted = new AtomicInteger();

        assertThatThrownBy(() -> client.rank(invalid, "question", List.of("one", "two"), Long.MAX_VALUE,
                submitted::incrementAndGet)).isInstanceOf(ProviderFailure.class);

        assertThat(submitted).hasValue(0);
        org.mockito.Mockito.verifyNoInteractions(http);
    }
}
