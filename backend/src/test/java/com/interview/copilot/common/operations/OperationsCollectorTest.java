package com.interview.copilot.common.operations;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.validation.operations.OperationPolicyTest;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class OperationsCollectorTest {
    private final OperationsStore store=mock(OperationsStore.class);
    private final SimpleMeterRegistry metrics=new SimpleMeterRegistry();
    private final OperationsCollector collector=new OperationsCollector(store,new ObjectMapper(),metrics);
    @Test void offer_sameEventId_deduplicatesMetricAndQueue() {
        var event=OperationPolicyTest.event(UUID.randomUUID().toString(),Map.of());
        assertThat(collector.offer(1,event,false)).isTrue();
        assertThat(collector.offer(1,event,false)).isTrue();
        assertThat(collector.queue().get("size")).isEqualTo(1);
        assertThat(metrics.find("operations.stage.duration").tags("stage","llm.complete","source","desktop","providerType","llm","outcome","success").timer().count()).isEqualTo(1);
    }
    @Test void offer_queueCapacity_dropsExplicitlyWithoutBlocking() {
        for(int i=0;i<2000;i++) assertThat(collector.offer(1,OperationPolicyTest.event(UUID.randomUUID().toString(),Map.of()),false)).isTrue();
        assertThat(collector.offer(1,OperationPolicyTest.event(UUID.randomUUID().toString(),Map.of()),false)).isFalse();
        assertThat(collector.queue().get("size")).isEqualTo(2000);
        assertThat(collector.queue().get("dropped")).isEqualTo(1L);
        assertThat(((Map<?,?>)collector.telemetry().get("dropReasons")).containsKey("capacity")).isTrue();
    }
    @Test void offer_eightParallelProducersWithinBudget_acceptsEveryEventWithoutContentionDrops() throws Exception {
        var start=new CountDownLatch(1);
        try(var executor=java.util.concurrent.Executors.newFixedThreadPool(8)) {
            var tasks=new java.util.ArrayList<java.util.concurrent.Future<Integer>>();
            for(int user=1;user<=8;user++) {
                final int account=user;
                tasks.add(executor.submit(() -> {
                    start.await();int accepted=0;
                    for(int i=0;i<150;i++) if(collector.offer(account,OperationPolicyTest.event(UUID.randomUUID().toString(),Map.of()),false)) accepted++;
                    return accepted;
                }));
            }
            start.countDown();for(var task:tasks) assertThat(task.get(10,TimeUnit.SECONDS)).isEqualTo(150);
        }
        assertThat(collector.queue().get("size")).isEqualTo(1200);
        assertThat(collector.telemetry().get("dropped")).isEqualTo(0L);
        assertThat((Map<?,?>)collector.telemetry().get("dropReasons")).isEmpty();
    }
    @Test void offer_deduplicationCachePressure_evictsOldEntriesWithoutDroppingEvents() {
        for(int i=0;i<7000;i++) {
            assertThat(collector.offer(1,OperationPolicyTest.event(UUID.randomUUID().toString(),Map.of()),false)).isTrue();
            if(i%64==63) collector.flush();
        }
        assertThat(collector.telemetry().get("accepted")).isEqualTo(7000L);
        assertThat(collector.telemetry().get("dropped")).isEqualTo(0L);
        assertThat(((Map<?,?>)ReflectionTestUtils.getField(collector,"seen")).size()).isLessThanOrEqualTo(5000);
    }
    @Test void flush_storageFailure_performsOnlyTwoRetriesAndDrops() {
        when(store.transaction(any())).thenThrow(new IllegalStateException("offline"));
        collector.offer(1,OperationPolicyTest.event(UUID.randomUUID().toString(),Map.of()),false);
        for(int i=0;i<3;i++) {ReflectionTestUtils.setField(collector,"retryAfter",0L);collector.flush();}
        verify(store,times(3)).transaction(any());
        assertThat(((Map<?,?>)collector.telemetry().get("dropReasons")).containsKey("storage_unavailable")).isTrue();
        assertThat(collector.queue().get("size")).isEqualTo(0);
        assertThat(collector.queue().get("dropped")).isEqualTo(1L);
    }
    @Test void flush_inFlightBatch_remainsWithinGlobalQueueBudgetDuringWrites() throws Exception {
        for(int i=0;i<2000;i++) collector.offer(1,OperationPolicyTest.event(UUID.randomUUID().toString(),Map.of()),false);
        var entered=new CountDownLatch(1);var release=new CountDownLatch(1);
        when(store.transaction(any())).thenAnswer(call -> {entered.countDown();release.await();return true;});
        try(var executor=java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
            var future=executor.submit(collector::flush);assertThat(entered.await(1,TimeUnit.SECONDS)).isTrue();
            assertThat(collector.queue().get("size")).isEqualTo(2000);
            assertThat(collector.queue().get("inFlightSize")).isEqualTo(64);
            assertThat(collector.offer(1,OperationPolicyTest.event(UUID.randomUUID().toString(),Map.of()),false)).isFalse();
            collector.close();release.countDown();future.get(1,TimeUnit.SECONDS);
            assertThat(collector.queue().get("bytes")).isEqualTo(0L);
        } finally {release.countDown();}
    }

}
