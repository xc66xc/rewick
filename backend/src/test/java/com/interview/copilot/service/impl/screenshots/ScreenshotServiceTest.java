package com.interview.copilot.service.impl.screenshots;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.common.ai.LlmConcurrency;
import com.interview.copilot.common.platform.PlatformConfigFixture;
import com.interview.copilot.common.usage.UsageLease;
import com.interview.copilot.model.platform.PlatformConfig;
import com.interview.copilot.model.platform.PlatformPolicy;
import com.interview.copilot.model.platform.PlatformSnapshot;
import com.interview.copilot.service.platform.PlatformRuntimeService;
import com.interview.copilot.service.usage.UsageService;
import com.interview.copilot.util.ai.ProviderHttpClient;
import com.interview.copilot.util.ai.ProviderJson;
import com.interview.copilot.util.ai.ScreenshotProbe;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ScreenshotServiceTest {
    private final UsageService usage = mock(UsageService.class);
    private final UsageLease lease = mock(UsageLease.class);
    private final PlatformRuntimeService providers = mock(PlatformRuntimeService.class);
    private final ProviderHttpClient http = mock(ProviderHttpClient.class);
    private final ProviderJson json = new ProviderJson(new ObjectMapper());
    private final LlmConcurrency concurrency = new LlmConcurrency();
    private final ScreenshotServiceImpl service = new ScreenshotServiceImpl(providers, http, json, usage, concurrency);

    private PlatformSnapshot snapshot(String modelId) {
        var base = PlatformConfigFixture.config(0, "synthetic-key");
        var config = new PlatformConfig(base.version(), base.providers(), base.models(), base.defaultModelId(),
                base.asr(), base.embedding(), PlatformConfig.WebSearch.disabled(), modelId);
        return new PlatformSnapshot(config, Map.of("primary", "synthetic-key"),
                PlatformPolicy.from(new com.interview.copilot.config.ProviderProperties()));
    }

    private String image() {
        var node = json.parse(json.encode(ScreenshotProbe.body(new com.interview.copilot.config.ProviderProperties.Llm())));
        return node.path("messages").path(0).path("content").path(1).path("image_url").path("url").asText();
    }

    @Test
    void recognize_selectedVisionModel_keepsLeaseAndImageOutOfResponse() {
        when(providers.snapshot()).thenReturn(snapshot("careful"));
        when(usage.start(2, "shot", "llm")).thenReturn(lease);
        when(http.json(any(), any(), any())).thenReturn(Mono.just(json.parse("{\"choices\":[{\"message\":{\"content\":\"求数组两数之和，输出下标。\"}}]}")));

        assertEquals("求数组两数之和，输出下标。", service.recognize(2, "shot", image(), null).block());
        verify(usage).describeModel(2, "shot", "llm", "upstream-careful");
        verify(lease).complete();
        verify(lease).close();
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"length", "content_filter", "tool_calls", "function_call", "unknown"})
    void recognize_nonnormalCompletion_rejectsPartialQuestionAndReleasesResources(String reason) {
        when(providers.snapshot()).thenReturn(snapshot("careful"));
        when(usage.start(2, "shot", "llm")).thenReturn(lease);
        when(http.json(any(), any(), any())).thenReturn(Mono.just(json.parse(
                "{\"choices\":[{\"message\":{\"content\":\"看似完整的题目但已经截断\"},\"finish_reason\":\"" + reason + "\"}]}")));
        assertThrows(com.interview.copilot.exception.ai.ProviderFailure.class,
                () -> service.recognize(2, "shot", image(), null).block());
        verify(lease, never()).complete();
        verify(lease, atLeastOnce()).fail();
        verify(lease).close();
        try (var permit = concurrency.acquire(2, 1)) { assertNotNull(permit); }
    }

    @Test
    void recognize_unconfigured_doesNotFallbackToDefaultAnswerModel() {
        when(providers.snapshot()).thenReturn(snapshot(""));
        assertThrows(com.interview.copilot.exception.ApiException.class,
                () -> service.recognize(2, "shot", image(), null).block());
        verifyNoInteractions(usage, http);
    }

    @Test
    void recognize_cancelled_releasesPermitAndUpstreamSubscription() {
        when(providers.snapshot()).thenReturn(snapshot("careful"));
        when(usage.start(2, "shot", "llm")).thenReturn(lease);
        var cancelled = new java.util.concurrent.atomic.AtomicBoolean();
        when(http.json(any(), any(), any())).thenReturn(Mono.never().doOnCancel(() -> cancelled.set(true)).cast(com.fasterxml.jackson.databind.JsonNode.class));
        var subscription = service.recognize(2, "shot", image(), null).subscribe();
        subscription.dispose();
        assertTrue(cancelled.get());
        verify(lease, atLeastOnce()).cancel();
        verify(lease).close();
        try (var permit = concurrency.acquire(2, 1)) { assertNotNull(permit); }
    }

    @Test
    void recognize_failedUsageDescription_closesLeaseAndPermit() {
        when(providers.snapshot()).thenReturn(snapshot("careful"));
        when(usage.start(2, "shot", "llm")).thenReturn(lease);
        doThrow(new IllegalStateException("synthetic storage failure")).when(usage).describeModel(anyLong(), anyString(), anyString(), anyString());
        assertThrows(IllegalStateException.class, () -> service.recognize(2, "shot", image(), null).block());
        verify(lease).fail();
        verify(lease).close();
        verifyNoInteractions(http);
        try (var permit = concurrency.acquire(2, 1)) { assertNotNull(permit); }
    }
}
