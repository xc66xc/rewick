package com.interview.copilot.service.impl.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.common.operations.LlmObservation;
import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.model.operations.OperationEvent;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.util.ai.ProviderJson;
import com.interview.copilot.util.ai.ProviderHttpClient;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class LlmObservationTimeoutTest {
    @Test void stream_totalDeadline_recordsTimeoutBeforeSafeProviderErrorMapping() {
        var events=new CopyOnWriteArrayList<OperationEvent>();
        var json=new ProviderJson(new ObjectMapper());
        var context=OperationContext.start(1,null,null,"request",null,"llm","model",events::add);
        var observation=new LlmObservation(context,json);
        var endpoint=new ProviderProperties.Llm();endpoint.setTotalTimeoutSeconds(1);endpoint.setIdleTimeoutSeconds(10);
        var http=mock(ProviderHttpClient.class);
        when(http.stream(eq(endpoint),any())).thenReturn(Flux.never());
        var service=new LlmServiceImpl(null,http,json,null,null,new com.interview.copilot.common.ai.LlmConcurrency());
        assertThatThrownBy(() -> observation.lifecycle(service.stream(endpoint,Map.of(),observation)).blockLast(Duration.ofSeconds(3)))
                .isInstanceOf(com.interview.copilot.exception.ApiException.class);
        assertThat(events).hasSize(1);assertThat(events.getFirst().outcome()).isEqualTo("timeout");
    }
}
