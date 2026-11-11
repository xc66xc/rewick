package com.interview.copilot.service.impl.references;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.mapper.references.ReferenceHybridMapper;
import com.interview.copilot.mapper.references.ReferenceMapper;
import com.interview.copilot.model.references.ReferenceQueryPlan;
import com.interview.copilot.service.platform.PlatformRuntimeService;
import org.junit.jupiter.api.Test;
import java.util.List;

class ReferenceQueryServiceTest {
    @Test void prepare_platformSnapshotFailure_preservesFrozenKeywordPolicy() {
        var mapper = mock(ReferenceMapper.class);
        var platform = mock(PlatformRuntimeService.class);
        when(mapper.policy()).thenReturn(ReferencePolicy.defaults());
        when(platform.snapshot()).thenThrow(new IllegalStateException("fixture unavailable"));
        var service = new ReferenceQueryServiceImpl(mapper, platform, mock(ReferenceHybridMapper.class));

        var plan = service.prepare();

        assertThat(plan.policy()).isEqualTo(ReferencePolicy.defaults());
        assertThat(plan.snapshot()).isNull();
        assertThat(plan.deadlineNanos() - plan.workDeadlineNanos()).isEqualTo(1_500_000_000L);
    }
    @Test void scope_expiredTotalBudget_returnsNoUnverifiedDocuments() {
        var hybrid = mock(ReferenceHybridMapper.class);
        var service = new ReferenceQueryServiceImpl(mock(ReferenceMapper.class), mock(PlatformRuntimeService.class), hybrid);
        var expired = new ReferenceQueryPlan(ReferencePolicy.defaults(), null, System.nanoTime() - 1, System.nanoTime() - 1);

        assertThat(service.scope(1, List.of("doc"), expired)).isEmpty();

        verifyNoInteractions(hybrid);
    }
}
