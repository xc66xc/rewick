package com.interview.copilot.model.operations;

import com.interview.copilot.validation.operations.OperationPolicy;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class OperationContextTest {
    @Test
    void finish_rerankFailure_preservesItsModelReasonAndSingleTerminalEvent() {
        var events = new ArrayList<OperationEvent>();
        var root = OperationContext.start(1, null, null, "request", null, "llm", "answer-model", events::add);
        var rerank = root.child("rerank").provider("rerank", "qwen3-rerank");

        rerank.finish("retrieval.rerank", "degraded", "protocol_error", Map.of("candidateCount", 6));
        rerank.finish("retrieval.rerank", "success", Map.of());

        assertThat(events).singleElement().satisfies(event -> {
            assertThat(event.parentSpanId()).isEqualTo(root.spanId());
            assertThat(event.model()).isEqualTo("qwen3-rerank");
            assertThat(event.reason()).isEqualTo("protocol_error");
            assertThat(event.outcome()).isEqualTo("degraded");
            OperationPolicy.event(event);
        });
    }

    @Test
    void finish_existingCall_preservesDefaultReasonMapping() {
        var events = new ArrayList<OperationEvent>();
        var context = OperationContext.start(1, null, null, null, null, "pg", "model", events::add);

        context.finish("retrieval.database", "degraded", Map.of());

        assertThat(events).singleElement().extracting(OperationEvent::reason).isEqualTo("unavailable");
    }
}
