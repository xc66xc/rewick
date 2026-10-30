package com.interview.copilot.validation.operations;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.model.operations.OperationEvent;
import com.interview.copilot.model.operations.OperationsSettings;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

public class OperationPolicyTest {
    public static OperationEvent event(String id,Map<String,Object> metadata) {
        return new OperationEvent(id,UUID.randomUUID().toString(),UUID.randomUUID().toString(),null,null,null,
                "llm.complete","desktop",OffsetDateTime.now().toString(),null,123,"success",null,"custom","llm","model","1.0",metadata);
    }
    @Test void validate_event_retainsOnlyBoundedMetadata() {
        OperationPolicy.event(event(UUID.randomUUID().toString(),Map.of("totalTokens",5,"bufferedBytes",100,"summaryEnabled",true)));
    }
    @ParameterizedTest
    @ValueSource(strings={"fragmentCount","inputTokens","outputTokens","totalTokens","audioBytes","bufferedBytes","filteredCount","triggerCount"})
    void validate_countMetadata_rejectsFractions(String key) {
        assertThatThrownBy(() -> OperationPolicy.event(event(UUID.randomUUID().toString(),Map.of(key,0.5))))
                .isInstanceOf(com.interview.copilot.exception.ApiException.class);
    }
    @ParameterizedTest
    @ValueSource(strings={"fragmentCount","inputTokens","outputTokens","totalTokens","audioBytes","bufferedBytes","filteredCount","triggerCount"})
    void validate_countMetadata_acceptsBoundedIntegers(String key) {
        assertThatCode(() -> OperationPolicy.event(event(UUID.randomUUID().toString(),Map.of(key,0))))
                .doesNotThrowAnyException();
        assertThatCode(() -> OperationPolicy.event(event(UUID.randomUUID().toString(),Map.of(key,1_000_000_000_000L))))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> OperationPolicy.event(event(UUID.randomUUID().toString(),Map.of(key,1_000_000_000_001L))))
                .isInstanceOf(com.interview.copilot.exception.ApiException.class);
    }
    @Test void validate_maxGapMetadata_acceptsFractionalMilliseconds() {
        assertThatCode(() -> OperationPolicy.event(event(UUID.randomUUID().toString(),Map.of("maxGapMs",0.5))))
                .doesNotThrowAnyException();
    }
    @ParameterizedTest @ValueSource(strings={"apiKey","url","prompt","transcript","anything"})
    void validate_unknownMetadata_rejectsSensitivePayload(String key) {
        assertThatThrownBy(() -> OperationPolicy.event(event(UUID.randomUUID().toString(),Map.of(key,"secret"))))
                .isInstanceOf(com.interview.copilot.exception.ApiException.class);
    }
    @Test void validate_identityAndUnknownTopLevel_rejectsForgedUser() throws Exception {
        assertThatThrownBy(() -> OperationPolicy.fields(new ObjectMapper().readTree("{\"durationMs\":1,\"userId\":2}")))
                .isInstanceOf(com.interview.copilot.exception.ApiException.class);
        assertThatThrownBy(() -> OperationPolicy.uuid("1-1-1-1-1")).isInstanceOf(com.interview.copilot.exception.ApiException.class);
    }
    @Test
    void validate_removedProvider_rejectsRemoteTelemetry() {
        var value = event(UUID.randomUUID().toString(), Map.of());
        var removed = new OperationEvent(value.eventId(), value.operationId(), value.spanId(),
                null, null, null, "retrieval.rag", "desktop", value.startedAt(), null, 1,
                "success", null, "platform", "bailian", null, null, Map.of());

        assertThatThrownBy(() -> OperationPolicy.event(removed))
                .isInstanceOf(com.interview.copilot.exception.ApiException.class);
    }

    @Test
    void validate_deepSeekSearchTelemetry_acceptsRealSearchProvider() {
        var value = event(UUID.randomUUID().toString(), Map.of());
        var search = new OperationEvent(value.eventId(), value.operationId(), value.spanId(),
                null, null, null, "retrieval.web", "backend", value.startedAt(), null, 1,
                "success", null, "platform", "deepseek", "deepseek-search", null, Map.of("fragmentCount", 2));

        assertThatCode(() -> OperationPolicy.event(search)).doesNotThrowAnyException();
    }

    @Test void settings_disabledAllAndGray_semanticsAreExplicit() {
        assertThat(OperationsSettings.disabled().allows(1)).isFalse();
        assertThat(new OperationsSettings(0,true,java.util.List.of(),null).allows(1)).isTrue();
        assertThat(new OperationsSettings(0,true,java.util.List.of("2"),null).allows(1)).isFalse();
        assertThat(new OperationsSettings(0,true,java.util.List.of("2"),null).allows(2)).isTrue();
    }
    @Test void validate_missingStageAndProvider_areSafeClientErrors() {
        var value=event(UUID.randomUUID().toString(),Map.of());
        var missing=new OperationEvent(value.eventId(),value.operationId(),value.spanId(),null,null,null,null,"desktop",value.startedAt(),null,1,"success",null,null,null,null,null,Map.of());
        assertThatThrownBy(() -> OperationPolicy.event(missing)).isInstanceOf(com.interview.copilot.exception.ApiException.class);
    }

}
