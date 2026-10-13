package com.interview.copilot.service.impl.search;

import com.interview.copilot.common.usage.UsageLease;
import com.interview.copilot.config.WebSearchProperties;
import com.interview.copilot.dto.preferences.UserPreferences;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.response.preferences.PreferencesResponse;
import com.interview.copilot.response.search.WebSearchResponse;
import com.interview.copilot.service.platform.DesktopSettingsService;
import com.interview.copilot.service.preferences.PreferencesService;
import com.interview.copilot.service.usage.UsageService;
import com.interview.copilot.util.search.TavilySearchClient;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class WebSearchServiceTest {
    private final DesktopSettingsService desktop = mock(DesktopSettingsService.class);
    private final PreferencesService preferences = mock(PreferencesService.class);
    private final UsageService usage = mock(UsageService.class);
    private final TavilySearchClient client = mock(TavilySearchClient.class);
    private final WebSearchServiceImpl service = new WebSearchServiceImpl(desktop, preferences, usage, client,
            new WebSearchProperties(true, "https://api.tavily.com/search", "fixture", 5, "advanced", 8000));

    private void authorized() {
        when(desktop.advanced(1)).thenReturn(true);
        var value = new UserPreferences("concise", 0.7, 800, new UserPreferences.AutoAnswer(true, 1000), true, false,
                new UserPreferences.PlatformSelections(null, null, null), true);
        when(preferences.get(1)).thenReturn(new PreferencesResponse(0, value, List.of()));
        when(usage.startForSession(1, "request", "knowledge", 9)).thenAnswer(input -> new UsageLease(usage, 1, "request", "knowledge", "session"));
        when(usage.active(1, "session")).thenReturn(true);
    }

    @Test
    void search_unauthorized_rejectsBeforeProviderOrUsage() {
        assertThatThrownBy(() -> service.search(1, 9, "query", "request").block()).isInstanceOf(ApiException.class);
        verifyNoInteractions(client, usage);
    }

    @Test
    void search_success_recordsModelAndCompletion() {
        authorized();
        when(client.search("query")).thenReturn(Mono.just(new WebSearchResponse("empty", null, List.of())));
        assertThat(service.search(1, 9, "query", "request").block().status()).isEqualTo("empty");
        verify(usage).describeModel(1, "request", "knowledge", "tavily-search");
        verify(usage).finish(1, "request", "knowledge", "complete");
    }

    @Test
    void search_providerFailure_degradesButRecordsFailure() {
        authorized();
        when(client.search("query")).thenReturn(Mono.error(new IllegalStateException("provider")));
        assertThat(service.search(1, 9, "query", "request").block().status()).isEqualTo("degraded");
        verify(usage).finish(1, "request", "knowledge", "failed");
    }

    @Test
    void search_endedInterview_doesNotDowngrade() {
        authorized();
        when(usage.startForSession(1, "request", "knowledge", 9)).thenThrow(new ApiException(org.springframework.http.HttpStatus.CONFLICT, "INTERVIEW_NOT_ACTIVE", "ended"));
        assertThatThrownBy(() -> service.search(1, 9, "query", "request").block()).isInstanceOf(ApiException.class);
        verifyNoInteractions(client);
    }

    @Test
    void search_disabledProvider_stillRequiresActiveInterview() {
        authorized();
        var disabled = new WebSearchServiceImpl(desktop, preferences, usage, client,
                new WebSearchProperties(false, "https://api.tavily.com/search", "", 5, "advanced", 8000));
        when(usage.startForSession(1, "request", "knowledge", 9)).thenThrow(new ApiException(org.springframework.http.HttpStatus.CONFLICT, "INTERVIEW_NOT_ACTIVE", "ended"));
        assertThatThrownBy(() -> disabled.search(1, 9, "query", "request").block()).isInstanceOf(ApiException.class);
        verifyNoInteractions(client);
    }

    @Test
    void search_revokedDuringProviderRequest_rejectsLateResult() throws InterruptedException {
        authorized();
        var pending = reactor.core.publisher.Sinks.<WebSearchResponse>one();
        var subscribed = new java.util.concurrent.CountDownLatch(1);
        when(client.search("query")).thenReturn(pending.asMono().doOnSubscribe(input -> subscribed.countDown()));
        var future = service.search(1, 9, "query", "request").toFuture();
        assertThat(subscribed.await(2, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
        when(desktop.advanced(1)).thenReturn(false);
        pending.tryEmitValue(new WebSearchResponse("empty", null, List.of()));
        assertThatThrownBy(() -> future.get(2, java.util.concurrent.TimeUnit.SECONDS))
                .hasCauseInstanceOf(ApiException.class);
        verify(usage, timeout(2000)).finish(1, "request", "knowledge", "cancelled");
    }

    @Test
    void search_cancelled_marksCancelledAndReleasesCapacity() throws InterruptedException {
        authorized();
        var subscribed = new java.util.concurrent.CountDownLatch(1);
        when(client.search("query")).thenReturn(Mono.<WebSearchResponse>never().doOnSubscribe(input -> subscribed.countDown()));
        var subscription = service.search(1, 9, "query", "request").subscribe();
        assertThat(subscribed.await(2, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
        subscription.dispose();
        verify(usage, timeout(2000)).finish(1, "request", "knowledge", "cancelled");
    }
}
