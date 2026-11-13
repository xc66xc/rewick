package com.interview.copilot.service.impl.references;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.common.references.MarkdownSectionParser;
import com.interview.copilot.common.references.PlatformEmbeddingClient;
import com.interview.copilot.common.references.ReferenceAnalyzer;
import com.interview.copilot.common.references.ReferenceChunkPlanner;
import com.interview.copilot.common.references.ReferenceDatabase;
import com.interview.copilot.common.references.ReferencePersistenceFixture;
import com.interview.copilot.common.usage.UsageLease;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.model.platform.PlatformConfig;
import com.interview.copilot.model.platform.PlatformPolicy;
import com.interview.copilot.model.platform.PlatformSnapshot;
import com.interview.copilot.model.references.ReferenceQueryPlan;
import com.interview.copilot.request.references.SearchReferenceBatchRequest;
import com.interview.copilot.service.auth.SessionGuardService;
import com.interview.copilot.service.platform.PlatformRuntimeService;
import com.interview.copilot.service.usage.UsageService;
import com.interview.copilot.util.ai.ProviderHttpClient;
import com.interview.copilot.util.rerank.BailianRerankClient;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.net.InetSocketAddress;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Real production batch, original mapper SQL, pgvector and one loopback embedding HTTP supplier. */
@Tag("integration")
@Testcontainers
class ReferenceBatchRetrievalServiceIntegrationTest {
    @Container static final ReferenceDatabase DATABASE = new ReferenceDatabase();
    private final ObjectMapper json = new ObjectMapper();
    private final List<List<String>> embeddingInputs = new CopyOnWriteArrayList<>();
    private final List<String> rerankInputs = new CopyOnWriteArrayList<>();
    private final AtomicBoolean invalidEmbedding = new AtomicBoolean();
    private CountDownLatch embeddingGate;
    private HttpServer supplier;
    private JdbcTemplate jdbc;
    private ReferencePersistenceFixture persistence;
    private com.interview.copilot.mapper.references.ReferenceHybridMapper mapper;
    private ReferenceVectorServiceImpl vectors;
    private ReferenceParallelServiceImpl parallel;
    private ReferenceQueryServiceImpl queries;
    private ReferenceRerankServiceImpl rerank;
    private ReferenceBatchRetrievalServiceImpl service;
    private PlatformRuntimeService runtime;
    private PlatformSnapshot snapshot;
    private UUID document;

    @BeforeEach
    void setup() throws Exception {
        var source = new DriverManagerDataSource(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
        jdbc = new JdbcTemplate(source);
        jdbc.execute("TRUNCATE app_users RESTART IDENTITY CASCADE");
        jdbc.execute("INSERT INTO app_users(display_name,password_hash) VALUES('synthetic-alice','fixture'),('synthetic-bob','fixture')");
        jdbc.execute("UPDATE reference_policy SET hybrid_enabled=TRUE,question_vector_min_score=0.9,bm25_timeout_ms=1000,bm25_top_k=4,vector_top_k=4,rrf_top_n=4,rerank_top_n=2");
        persistence = new ReferencePersistenceFixture(source);
        startSupplier();
        snapshot = snapshot();
        var http = new ProviderHttpClient();
        var embedding = new PlatformEmbeddingClient(runtime, http);
        document = index(1, "## Agent常见模式有哪些？\nAgent可采用计划执行模式。\n## SSE是什么？\nSSE是服务器事件流。\n## MCP传输方式有哪些？\nMCP包含标准输入输出绑定。", embedding.selection(snapshot).fingerprint());
        mapper = spy(persistence.hybrid);
        var manager = new DataSourceTransactionManager(source);
        vectors = new ReferenceVectorServiceImpl(mapper, manager);
        var recall = new ReferenceRecallServiceImpl(mapper, embedding, new ReferenceAnalyzer(), manager, vectors);
        parallel = new ReferenceParallelServiceImpl(recall);
        queries = spy(new ReferenceQueryServiceImpl(persistence.mapper, runtime, mapper));
        rerank = spy(new ReferenceRerankServiceImpl(new BailianRerankClient(http)));
        var contexts = new ReferenceContextServiceImpl(mapper, manager, new io.micrometer.core.instrument.simple.SimpleMeterRegistry());
        service = new ReferenceBatchRetrievalServiceImpl(queries, recall, parallel,
                new ReferenceBatchRankingServiceImpl(rerank), new ReferenceBatchContextServiceImpl(contexts));
    }

    @AfterEach
    void close() {
        if (parallel != null) parallel.close();
        if (vectors != null) vectors.close();
        if (supplier != null) supplier.stop(0);
    }

    @Test
    void retrieve_threeQueries_usesOneEmbeddingThreeBm25SixVectorSqlAndOwnRerankQueries() {
        UUID foreign = index(2, "## Agent是什么？\nAgent foreign confidential evidence.", new PlatformEmbeddingClient(runtime, new ProviderHttpClient()).selection(snapshot).fingerprint());
        UUID stale = index(1, "## 机密水果是什么？\nstale fingerprint confidential evidence.", "stale-fingerprint");
        var result = service.retrieve(1, new SearchReferenceBatchRequest(input().queries(), List.of(document, foreign, stale)), null);

        assertThat(embeddingInputs).containsExactly(List.of("Agent", "SSE", "MCP"));
        verify(mapper, times(3)).bm25(anyLong(), anyList(), anyList(), anyDouble(), anyDouble(), anyInt());
        verify(mapper, times(3)).questions(anyLong(), anyList(), anyString(), anyString(), anyDouble(), anyInt());
        verify(mapper, times(3)).vector(anyLong(), anyList(), anyString(), anyString(), anyDouble(), anyInt());
        verify(runtime, times(1)).snapshot();
        for (String query : List.of("Agent", "SSE", "MCP")) verify(rerank).rank(org.mockito.ArgumentMatchers.eq(query), anyList(), any(), anyLong(), any());
        assertThat(result.queries()).hasSize(3).allSatisfy(query -> {
            assertThat(query.status()).isEqualTo("ready");
            assertThat(query.excerptIds()).hasSize(1);
            assertThat(query.hybrid().vector().candidateCount()).isEqualTo(1);
        });
        assertThat(result.excerpts()).hasSize(3).allSatisfy(excerpt -> {
            assertThat(excerpt.documentId()).isEqualTo(document.toString());
            assertThat(excerpt.text()).doesNotContain("confidential");
        });
        assertThat(result.excerpts().stream().mapToInt(value -> value.text().length()).sum()).isLessThanOrEqualTo(4800);
        assertThat(service.retrieve(2, input(), null).excerpts()).isEmpty();
    }

    @Test
    void retrieve_invalidBatchEmbedding_keepsAllKeywordResultsWithoutVectorSql() {
        invalidEmbedding.set(true);

        var result = service.retrieve(1, input(), null);

        assertThat(embeddingInputs).hasSize(1);
        assertThat(result.queries()).allSatisfy(query -> {
            assertThat(query.status()).isEqualTo("degraded");
            assertThat(query.hybrid().bm25().candidateCount()).isEqualTo(1);
            assertThat(query.hybrid().vector().status()).isEqualTo("degraded");
            assertThat(query.excerptIds()).isNotEmpty();
        });
        verify(mapper, times(0)).vector(anyLong(), anyList(), anyString(), anyString(), anyDouble(), anyInt());
    }

    @Test
    void retrieve_rerankEnabled_sendsEachOwnQueryAndAppliesPerQuestionLimit() {
        var old = snapshot.view();
        var providers = new ArrayList<>(old.providers());
        providers.add(new PlatformConfig.Provider("rerank", "synthetic-rerank", "rerank",
                "http://127.0.0.1:" + supplier.getAddress().getPort() + "/rerank", true, false, null));
        snapshot = new PlatformSnapshot(new PlatformConfig(old.version(), providers, old.models(), old.defaultModelId(), old.asr(),
                old.embedding(), old.webSearch(), "", new PlatformConfig.Rerank(true, "rerank", "qwen3-rerank", 1000)),
                Map.of("embedding", "synthetic-only-key", "rerank", "synthetic-rerank-key"), PlatformPolicy.from(new ProviderProperties()));
        when(runtime.snapshot()).thenReturn(snapshot);
        jdbc.execute("UPDATE reference_policy SET rerank_top_n=1");
        String fingerprint = new PlatformEmbeddingClient(runtime, new ProviderHttpClient()).selection(snapshot).fingerprint();
        UUID other = index(1, "## Agent常见模式有哪些？\nAgent第二份合成资料。\n## SSE是什么？\nSSE第二份合成资料。\n## MCP传输方式有哪些？\nMCP第二份合成资料。", fingerprint);

        var result = service.retrieve(1, new SearchReferenceBatchRequest(input().queries(), List.of(document, other)), null);

        assertThat(embeddingInputs).hasSize(1);
        assertThat(rerankInputs).containsExactlyInAnyOrder("Agent", "SSE", "MCP");
        assertThat(result.queries()).allSatisfy(query -> {
            assertThat(query.hybrid().rerank().status()).isEqualTo("ready");
            assertThat(query.hybrid().rerank().candidateCount()).isEqualTo(2);
            assertThat(query.hybrid().rerank().resultCount()).isEqualTo(1);
            assertThat(query.hybrid().rerank().topN()).isEqualTo(1);
            assertThat(query.excerptIds()).hasSize(1);
        });
    }

    @Test
    void retrieve_twoPipelinesInFlight_doesNotStartQueuedThirdQueryOrDeadlockSqlPools() throws Exception {
        var entered = new CountDownLatch(2);
        var release = new CountDownLatch(1);
        doAnswer(call -> { entered.countDown(); await(release); return call.callRealMethod(); })
                .when(rerank).rank(anyString(), anyList(), any(), anyLong(), any());
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var pending = executor.submit(() -> service.retrieve(1, input(), null));
            try {
                assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
                verify(mapper, times(2)).bm25(anyLong(), anyList(), anyList(), anyDouble(), anyDouble(), anyInt());
                release.countDown();
                assertThat(pending.get(5, TimeUnit.SECONDS).queries()).hasSize(3);
            } finally { release.countDown(); }
        }
    }

    @Test
    void retrieve_parentBudget_sealsCompletedQuestionsAndCancelsStalledPipeline() throws Exception {
        var stopped = new CountDownLatch(1);
        var forever = new CountDownLatch(1);
        long start = System.nanoTime();
        doReturn(new ReferenceQueryPlan(persistence.mapper.policy(), snapshot,
                start + Duration.ofMillis(3500).toNanos(), start + Duration.ofSeconds(2).toNanos())).when(queries).prepare();
        doAnswer(call -> {
            if (call.<String>getArgument(0).equals("SSE")) try { await(forever); } finally { stopped.countDown(); }
            return call.callRealMethod();
        }).when(rerank).rank(anyString(), anyList(), any(), anyLong(), any());

        var result = service.retrieve(1, input(), null);

        assertThat(stopped.await(3, TimeUnit.SECONDS)).isTrue();
        assertThat(result.queries().get(1).status()).isEqualTo("degraded");
        assertThat(result.queries().get(1).message()).contains("timeout");
        assertThat(result.queries().getFirst().excerptIds()).isNotEmpty();
        assertThat(result.queries().getLast().excerptIds()).isNotEmpty();
    }

    @Test
    void retrieve_embeddingExhaustsWorkBudget_preservesCompletedBm25AndDoesNotStartThirdQuestion() {
        embeddingGate = new CountDownLatch(1);
        long start = System.nanoTime();
        doReturn(new ReferenceQueryPlan(persistence.mapper.policy(), snapshot,
                start + Duration.ofMillis(3500).toNanos(), start + Duration.ofSeconds(2).toNanos())).when(queries).prepare();

        try {
            var result = service.retrieve(1, input(), null);

            assertThat(result.queries().subList(0, 2)).allSatisfy(query -> {
                assertThat(query.excerptIds()).isNotEmpty();
                assertThat(query.hybrid().bm25().candidateCount()).isEqualTo(1);
                assertThat(query.hybrid().vector().status()).isEqualTo("degraded");
                assertThat(query.status()).isEqualTo("degraded");
            });
            assertThat(result.queries().getLast().excerptIds()).isEmpty();
            assertThat(result.queries().getLast().message()).contains("timeout");
            verify(mapper, times(2)).bm25(anyLong(), anyList(), anyList(), anyDouble(), anyDouble(), anyInt());
            verify(mapper, times(0)).vector(anyLong(), anyList(), anyString(), anyString(), anyDouble(), anyInt());
            assertThat(embeddingInputs).hasSize(1);
        } finally { embeddingGate.countDown(); }
    }

    @Test
    void search_explicitCancellation_stopsChildrenQueuedQuestionsAndSettlesLeaseOnce() throws Exception {
        var entered = new CountDownLatch(2);
        var stopped = new CountDownLatch(2);
        doAnswer(call -> { entered.countDown(); try { await(new CountDownLatch(1)); } finally { stopped.countDown(); } return call.callRealMethod(); })
                .when(rerank).rank(anyString(), anyList(), any(), anyLong(), any());
        var usage = mock(UsageService.class);
        var cancellation = new ReferenceCancellationServiceImpl();
        String id = UUID.randomUUID().toString();
        when(usage.startForSession(1, id, "knowledge", 10)).thenReturn(new UsageLease(usage, 1, id, "knowledge", "synthetic"));
        when(usage.active(1, "synthetic")).thenReturn(true);
        var search = new ReferenceBatchSearchServiceImpl(persistence.storage, usage, service, cancellation, mock(SessionGuardService.class));
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var pending = executor.submit(() -> search.search(1, 10, id, input(), null));
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            cancellation.cancel(1, id);
            assertThatThrownBy(() -> pending.get(4, TimeUnit.SECONDS)).hasCauseInstanceOf(CancellationException.class);
            assertThat(stopped.await(3, TimeUnit.SECONDS)).isTrue();
        }
        verify(usage, times(1)).finish(1, id, "knowledge", "cancelled");
        verify(mapper, times(2)).bm25(anyLong(), anyList(), anyList(), anyDouble(), anyDouble(), anyInt());
    }

    @Test
    void retrieve_scopeChangesDuringRanking_dropsAlreadyLoadedEvidence() {
        var changed = new AtomicBoolean();
        doAnswer(call -> { if (changed.compareAndSet(false, true)) persistence.storage.update(1, document.toString(), false, null); return call.callRealMethod(); })
                .when(rerank).rank(anyString(), anyList(), any(), anyLong(), any());

        var result = service.retrieve(1, input(), null);

        assertThat(result.excerpts()).isEmpty();
        assertThat(result.status()).isEqualTo("degraded");
    }

    @Test
    void retrieve_sharedQa_usesActualIncludedRangesWithoutDroppingDifferentQuestions() {
        String fingerprint = new PlatformEmbeddingClient(runtime, new ProviderHttpClient()).selection(snapshot).fingerprint();
        UUID shared = index(1, "## 传输机制有哪些区别？\nSSE通过事件流传递消息。\n\n" + "用于填充不同父块的合成正文。".repeat(180)
                + "\n\nMCP通过协议交换上下文。", fingerprint);
        invalidEmbedding.set(true);
        var request = new SearchReferenceBatchRequest(List.of(new SearchReferenceBatchRequest.Query("q1", "SSE"),
                new SearchReferenceBatchRequest.Query("q2", "MCP")), List.of(shared));

        var result = service.retrieve(1, request, null);

        assertThat(result.queries()).allSatisfy(query -> assertThat(query.excerptIds()).isNotEmpty());
        for (var query : request.queries()) {
            var detail = result.queries().stream().filter(value -> value.questionId().equals(query.questionId())).findFirst().orElseThrow();
            assertThat(result.excerpts().stream().filter(excerpt -> detail.excerptIds().contains(excerpt.excerptId())).toList())
                    .allSatisfy(excerpt -> assertThat(excerpt.text()).contains(query.query()));
        }
        assertThat(result.excerpts()).hasSize(2);
        assertThat(result.excerpts().stream().mapToInt(value -> value.text().length()).sum()).isLessThanOrEqualTo(4800);
    }

    @Test
    void retrieve_sharedShortQa_deduplicatesBodyWithBothQuestionIds() {
        String fingerprint = new PlatformEmbeddingClient(runtime, new ProviderHttpClient()).selection(snapshot).fingerprint();
        UUID shared = index(1, "## 传输机制有哪些区别？\nSSE传递事件流，MCP交换上下文。", fingerprint);
        invalidEmbedding.set(true);

        var result = service.retrieve(1, new SearchReferenceBatchRequest(List.of(new SearchReferenceBatchRequest.Query("q1", "SSE"),
                new SearchReferenceBatchRequest.Query("q2", "MCP")), List.of(shared)), null);

        assertThat(result.excerpts()).singleElement().satisfies(excerpt -> assertThat(excerpt.questionIds()).containsExactly("q1", "q2"));
        assertThat(result.queries()).allSatisfy(query -> assertThat(query.excerptIds()).containsExactly(result.excerpts().getFirst().excerptId()));
    }

    private SearchReferenceBatchRequest input() {
        return new SearchReferenceBatchRequest(List.of(new SearchReferenceBatchRequest.Query("q1", "Agent"),
                new SearchReferenceBatchRequest.Query("q2", "SSE"), new SearchReferenceBatchRequest.Query("q3", "MCP")), List.of(document));
    }

    private void startSupplier() throws Exception {
        supplier = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        supplier.createContext("/embeddings", exchange -> {
            var body = json.readTree(exchange.getRequestBody());
            List<String> input = new ArrayList<>();
            body.path("input").forEach(value -> input.add(value.asText()));
            embeddingInputs.add(List.copyOf(input));
            if (embeddingGate != null) await(embeddingGate);
            var rows = new ArrayList<Map<String, Object>>();
            for (int i = input.size() - 1; i >= 0; i--) rows.add(Map.of("index", invalidEmbedding.get() ? 0 : i, "embedding", axis(i)));
            byte[] response = json.writeValueAsBytes(Map.of("data", rows));
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        supplier.createContext("/rerank", exchange -> {
            var body = json.readTree(exchange.getRequestBody());
            rerankInputs.add(body.path("input").path("query").asText());
            int count = body.path("input").path("documents").size();
            var rows = java.util.stream.IntStream.range(0, count).mapToObj(index ->
                    Map.of("index", index, "relevance_score", (index + 1.0) / count)).toList();
            byte[] response = json.writeValueAsBytes(Map.of("output", Map.of("results", rows)));
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        supplier.start();
    }

    private PlatformSnapshot snapshot() {
        var config = new PlatformConfig(7, List.of(new PlatformConfig.Provider("embedding", "synthetic", "embedding",
                "http://127.0.0.1:" + supplier.getAddress().getPort() + "/embeddings", true, false, null)), List.of(), "",
                new PlatformConfig.Asr(false, "", ""), new PlatformConfig.Embedding(true, "embedding", "synthetic-vector", 1024));
        var frozen = new PlatformSnapshot(config, Map.of("embedding", "synthetic-only-key"), PlatformPolicy.from(new ProviderProperties()));
        runtime = mock(PlatformRuntimeService.class);
        when(runtime.snapshot()).thenReturn(frozen);
        return frozen;
    }

    private UUID index(long user, String text, String fingerprint) {
        var id = UUID.randomUUID();
        persistence.storage.insert(user, id.toString(), "synthetic.md", id.toString().replace("-", "").repeat(2), 100);
        var parsed = new ReferenceChunkPlanner().plan(new MarkdownSectionParser().parse(text), "md", ReferencePolicy.defaults());
        var job = persistence.jobs.claim();
        assertThat(persistence.jobs.prepare(job, parsed)).isTrue();
        assertThat(persistence.jobs.stage(job, parsed.chunks(), Collections.nCopies(parsed.chunks().size(), axis(3)), fingerprint)).isTrue();
        var questions = parsed.sections().stream().filter(section -> !section.questionText().isBlank()).toList();
        assertThat(persistence.jobs.stageQuestions(job, questions, java.util.stream.IntStream.range(0, questions.size()).mapToObj(this::axis).toList(), fingerprint)).isTrue();
        persistence.jobs.publish(job, parsed, fingerprint);
        return id;
    }

    private List<Double> axis(int index) {
        var values = new ArrayList<>(Collections.nCopies(1024, 0.0));
        values.set(index, 1.0);
        return values;
    }

    private void await(CountDownLatch latch) {
        try { if (!latch.await(8, TimeUnit.SECONDS)) throw new IllegalStateException("Synthetic latch expired"); }
        catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new CancellationException(); }
    }
}
