package com.interview.copilot.embedding;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.ai.ProviderHttpClient;
import com.interview.copilot.ai.ProviderProperties;
import com.interview.copilot.common.ApiException;
import com.interview.copilot.platform.PlatformRuntimeResolver;
import com.interview.copilot.platform.PlatformSnapshot;
import com.interview.copilot.usage.UsageLease;
import com.interview.copilot.usage.UsageService;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import reactor.core.publisher.Mono;

class EmbeddingProxyTest {
    private final ObjectMapper json = new ObjectMapper();
    private final PlatformRuntimeResolver providers = mock(PlatformRuntimeResolver.class);
    private final PlatformSnapshot snapshot = mock(PlatformSnapshot.class);
    private final ProviderHttpClient http = mock(ProviderHttpClient.class);
    private final UsageService usage = mock(UsageService.class);
    private final UsageLease lease = mock(UsageLease.class);
    private final EmbeddingProxy proxy = new EmbeddingProxy(providers, http, usage);

    @BeforeEach void setUp() {
        var config = new ProviderProperties.Embedding();
        config.setModel("approved");
        config.setDimensions(64);
        when(providers.snapshot()).thenReturn(snapshot);
        when(snapshot.embedding("vector")).thenReturn(config);
        when(usage.start(anyLong(), anyString(), anyString())).thenReturn(lease);
    }

    @Test void embed_success_reservesPerUserKnowledgeQuotaAndSanitizesResponse() {
        when(http.json(any(), any(), any())).thenReturn(Mono.just(json.valueToTree(Map.of("secret", "hidden", "data",
                List.of(Map.of("index", 0, "embedding", Collections.nCopies(64, 0.1)))))));
        var result = proxy.embed(42, "request-1", json.valueToTree(Map.of("serviceId", "vector", "input", "你好")));
        assertThat(result.toString()).doesNotContain("hidden");
        verify(usage).start(42, "request-1", "knowledge");
        verify(usage).describeModel(42, "request-1", "knowledge", "approved");
        verify(lease).complete();
    }

    @Test void embed_quotaFailure_neverCallsProviderAndPreserves429() {
        when(usage.start(anyLong(), anyString(), anyString())).thenThrow(new ApiException(HttpStatus.TOO_MANY_REQUESTS, "quota_exceeded", "limit"));
        assertThatThrownBy(() -> proxy.embed(42, "request", json.valueToTree(Map.of("serviceId", "vector", "input", "你好"))))
                .isInstanceOf(ApiException.class).extracting("status").isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        verifyNoInteractions(http);
    }

    @Test void embed_providerFailure_redactsDetailsAndMarksFailure() {
        when(http.json(any(), any(), any())).thenReturn(Mono.error(new IllegalStateException("secret-token")));
        assertThatThrownBy(() -> proxy.embed(42, "request", json.valueToTree(Map.of("serviceId", "vector", "input", "你好"))))
                .isInstanceOf(ApiException.class).hasMessageNotContaining("secret-token");
        verify(lease).fail();
    }

    @Test void embed_modelOverride_rejectedBeforeQuotaAndUpstream() {
        assertThatThrownBy(() -> proxy.embed(42, "request", json.valueToTree(Map.of("serviceId", "vector", "input", "你好", "model", "other"))))
                .isInstanceOf(ApiException.class);
        verifyNoInteractions(http, usage);
    }
}
