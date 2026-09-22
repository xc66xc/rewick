package com.interview.copilot.service.impl.asr;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.config.PlatformLimitsProperties;
import com.interview.copilot.service.background.BackgroundService;
import com.interview.copilot.util.asr.AsrEndpoint;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AsrSessionServiceImplTest {
    private final BackgroundService backgrounds = mock(BackgroundService.class);
    private final AsrSessionServiceImpl service = new AsrSessionServiceImpl(backgrounds, new PlatformLimitsProperties(3600));
    private final ObjectMapper json = new ObjectMapper();

    @Test void withHotwords_explicitEmptyVocabulary_disablesSavedTerms() throws Exception {
        var input = json.readTree("{\"payload\":{\"parameters\":{\"vocabulary\":{}}}}");
        assertThat(service.withHotwords(7L, "one", AsrEndpoint.QWEN_STREAMING, input)).isSameAs(input);
        verifyNoInteractions(backgrounds);
    }
    @Test void withHotwords_supportedModel_injectsBoundSessionVocabulary() throws Exception {
        var input = json.readTree("{\"payload\":{\"parameters\":{}}}");
        when(backgrounds.asrHotwords(7L, "session-one")).thenReturn(List.of("虚拟量测", "Agent"));
        var result = service.withHotwords(7L, "session-one", AsrEndpoint.QWEN_STREAMING, input);
        assertThat(result.at("/payload/parameters/vocabulary/Agent").asInt()).isEqualTo(3);
        assertThat(result.at("/payload/parameters/vocabulary/虚拟量测").asInt()).isEqualTo(3);
        assertThat(input.at("/payload/parameters/vocabulary").isMissingNode()).isTrue();
        verify(backgrounds).asrHotwords(7L, "session-one");
    }
    @Test void withHotwords_explicitVocabulary_preservesOverride() throws Exception {
        var input = json.readTree("{\"payload\":{\"parameters\":{\"vocabulary\":{\"Agent\":2}}}}");
        assertThat(service.withHotwords(7L, "one", AsrEndpoint.QWEN_STREAMING, input)).isSameAs(input);
        verifyNoInteractions(backgrounds);
    }
    @Test void withHotwords_unsupportedModel_doesNotReadOrSendTerms() throws Exception {
        var input = json.readTree("{\"payload\":{\"parameters\":{}}}");
        assertThat(service.withHotwords(7L, "one", "paraformer-realtime-v2", input)).isSameAs(input);
        verifyNoInteractions(backgrounds);
    }
    @Test void withHotwords_noTerms_keepsOriginalFrame() throws Exception {
        var input = json.readTree("{\"payload\":{\"parameters\":{}}}");
        when(backgrounds.asrHotwords(7L, "one")).thenReturn(List.of());
        assertThat(service.withHotwords(7L, "one", AsrEndpoint.QWEN_STREAMING, input)).isSameAs(input);
    }
}
