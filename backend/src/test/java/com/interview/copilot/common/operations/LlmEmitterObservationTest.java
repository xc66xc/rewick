package com.interview.copilot.common.operations;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.common.ai.LlmConcurrency;
import com.interview.copilot.common.ai.LlmStreamSession;
import com.interview.copilot.common.usage.UsageLease;
import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.model.operations.OperationEvent;
import com.interview.copilot.util.ai.ProviderJson;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import reactor.core.publisher.Flux;
import java.util.concurrent.CopyOnWriteArrayList;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class LlmEmitterObservationTest {
    @Test void emitter_timeout_recordsTimeoutBeforeCancellingUpstream() {
        var events=new CopyOnWriteArrayList<OperationEvent>();
        var context=OperationContext.start(1,null,null,"request",null,"llm","model",events::add);
        var observation=new LlmObservation(context,new ProviderJson(new ObjectMapper()));
        var lease=mock(UsageLease.class);
        var session=new LlmStreamSession(lease,new LlmConcurrency().acquire(1,1),1000,()->observation.finish("timeout"));
        var emitter=session.start(observation.lifecycle(Flux.never()));
        ((Runnable)ReflectionTestUtils.getField(emitter,"timeoutCallback")).run();
        assertThat(events).hasSize(1);assertThat(events.getFirst().outcome()).isEqualTo("timeout");
        verify(lease).fail();
    }
}
