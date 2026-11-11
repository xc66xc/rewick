package com.interview.copilot.service.impl.references;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import com.interview.copilot.entity.references.ReferenceScopeEntity;
import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.service.references.ReferenceRecallService;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

class ReferenceParallelServiceTest {
    @Test void recall_expiredWorkDeadline_preservesCompletedBm25AndInterruptsVector() throws Exception {
        var recall = org.mockito.Mockito.mock(ReferenceRecallService.class);
        var interrupted = new CountDownLatch(1);
        var vectorStarted = new CountDownLatch(1);
        var hit = new ReferenceCandidateEntity("doc", 1, 1, 1, 1, "正文", 1, 0);
        org.mockito.Mockito.when(recall.bm25(org.mockito.ArgumentMatchers.anyLong(), org.mockito.ArgumentMatchers.anyList(),
                org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.any(com.interview.copilot.model.references.ReferenceQueryPlan.class)))
                .thenReturn(List.of(hit));
        org.mockito.Mockito.when(recall.vector(org.mockito.ArgumentMatchers.anyLong(), org.mockito.ArgumentMatchers.anyList(),
                org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.any(com.interview.copilot.model.references.ReferenceQueryPlan.class), org.mockito.ArgumentMatchers.isNull()))
                .thenAnswer(call -> { vectorStarted.countDown(); try { new CountDownLatch(1).await(); }
                    catch (InterruptedException error) { interrupted.countDown(); Thread.currentThread().interrupt(); }
                    throw new java.util.concurrent.CancellationException(); });
        var service = new ReferenceParallelServiceImpl(recall);
        long workDeadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(100);
        var plan = new com.interview.copilot.model.references.ReferenceQueryPlan(ReferencePolicy.defaults(), null,
                workDeadline + TimeUnit.SECONDS.toNanos(1), workDeadline);
        try {
            var result = service.recall(1, List.of(), "query", plan, null);

            assertThat(result.bm25().candidates()).containsExactly(hit);
            assertThat(result.vector().status()).isEqualTo("degraded");
            assertThat(vectorStarted.await(1, TimeUnit.SECONDS)).isTrue();
            assertThat(interrupted.await(1, TimeUnit.SECONDS)).isTrue();
        } finally { service.close(); }
    }

    @Test void recall_blockedVector_bm25StartsBeforeVectorCompletes() throws Exception {
        var both = new CountDownLatch(2);
        var release = new CountDownLatch(1);
        var recall = new ReferenceRecallService() {
            public List<ReferenceCandidateEntity> bm25(long user,List<ReferenceScopeEntity> scope,String query,ReferencePolicy policy) {
                both.countDown(); await(release); return List.of();
            }
            public List<ReferenceCandidateEntity> vector(long user,List<ReferenceScopeEntity> scope,String query,ReferencePolicy policy,OperationContext context) {
                both.countDown(); await(release); return List.of();
            }
        };
        var service = new ReferenceParallelServiceImpl(recall);
        try (var callers = java.util.concurrent.Executors.newSingleThreadExecutor()) {
            var pending = callers.submit(() -> service.recall(1,List.of(),"query",ReferencePolicy.defaults(),null));
            assertThat(both.await(2,TimeUnit.SECONDS)).isTrue();
            assertThat(pending.isDone()).isFalse();
            release.countDown();
            assertThat(pending.get(2,TimeUnit.SECONDS).bm25().status()).isEqualTo("empty");
        } finally { release.countDown(); service.close(); }
    }
    @Test void recall_vectorFailure_keepsBm25Branch() {
        var recall = org.mockito.Mockito.mock(ReferenceRecallService.class);
        org.mockito.Mockito.when(recall.bm25(org.mockito.ArgumentMatchers.anyLong(),org.mockito.ArgumentMatchers.anyList(),org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.any(ReferencePolicy.class)))
                .thenReturn(List.of(new ReferenceCandidateEntity("doc",1,1,1,1,"命中正文",1,0)));
        org.mockito.Mockito.when(recall.vector(org.mockito.ArgumentMatchers.anyLong(),org.mockito.ArgumentMatchers.anyList(),org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.any(ReferencePolicy.class),org.mockito.ArgumentMatchers.isNull()))
                .thenThrow(new IllegalStateException("fake provider unavailable"));
        var service = new ReferenceParallelServiceImpl(recall);
        try {
            var result = service.recall(1,List.of(),"query",ReferencePolicy.defaults(),null);
            assertThat(result.bm25().candidates()).hasSize(1);
            assertThat(result.vector().status()).isEqualTo("degraded");
        } finally { service.close(); }
    }
    private void await(CountDownLatch latch) {
        try { latch.await(3,TimeUnit.SECONDS); }
        catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new java.util.concurrent.CancellationException(); }
    }
}
