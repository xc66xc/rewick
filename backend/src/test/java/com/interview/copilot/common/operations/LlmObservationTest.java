package com.interview.copilot.common.operations;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.model.operations.OperationEvent;
import com.interview.copilot.util.ai.ProviderJson;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;
import java.util.ArrayList;
import static org.assertj.core.api.Assertions.*;

class LlmObservationTest {
    private final ArrayList<OperationEvent> events=new ArrayList<>();
    private final OperationContext context=OperationContext.start(1,null,null,"request",null,"llm","model",events::add);
    private final LlmObservation observation=new LlmObservation(context,new ProviderJson(new ObjectMapper()));
    @Test void stream_emptyContentHeartbeatAndUsage_emitsOnlyRealFirstContentAndOneTerminal() {
        observation.stream(Flux.just("{\"choices\":[{\"delta\":{\"content\":\" \"}}]}",
                "{\"choices\":[{\"delta\":{\"content\":\"answer\"}}]}",
                "{\"choices\":[],\"usage\":{\"total_tokens\":12}}","[DONE]")).blockLast();
        assertThat(events).extracting(OperationEvent::stage).containsExactly("llm.first_content","llm.complete");
        assertThat(events.getLast().metadata()).containsEntry("totalTokens",12L);
        assertThat(events.getLast().outcome()).isEqualTo("success");
        assertThat(events.getLast().metadata()).doesNotContainKey("inputTokens");
    }
    @Test void stream_cancelled_emitsOneCancelledTerminalWithoutFakeFirst() {
        var subscription=observation.stream(Flux.never()).subscribe();subscription.dispose();
        assertThat(events).hasSize(1);
        assertThat(events.getFirst().outcome()).isEqualTo("cancelled");
    }
    @Test void single_blankContent_doesNotInventFirstContentOrTokens() {
        observation.single(java.util.Map.of("choices",java.util.List.of(java.util.Map.of("message",java.util.Map.of("content"," ")))));
        assertThat(events).extracting(OperationEvent::stage).containsExactly("llm.complete");
        assertThat(events.getFirst().metadata()).doesNotContainKeys("inputTokens","outputTokens","totalTokens");
    }

}
