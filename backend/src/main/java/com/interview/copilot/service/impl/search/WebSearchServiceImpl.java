package com.interview.copilot.service.impl.search;

import com.interview.copilot.common.usage.UsageLease;
import com.interview.copilot.config.WebSearchProperties;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.response.search.WebSearchResponse;
import com.interview.copilot.service.platform.DesktopSettingsService;
import com.interview.copilot.service.preferences.PreferencesService;
import com.interview.copilot.service.search.WebSearchService;
import com.interview.copilot.service.usage.UsageService;
import com.interview.copilot.util.search.TavilySearchClient;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.publisher.Sinks;
import reactor.core.scheduler.Schedulers;
import java.util.concurrent.Semaphore;

@Service
public class WebSearchServiceImpl implements WebSearchService {
    private final DesktopSettingsService desktop;
    private final PreferencesService preferences;
    private final UsageService usage;
    private final TavilySearchClient client;
    private final WebSearchProperties config;
    private final Semaphore capacity = new Semaphore(16);

    public WebSearchServiceImpl(DesktopSettingsService desktop, PreferencesService preferences,
            UsageService usage, TavilySearchClient client, WebSearchProperties config) {
        this.desktop = desktop;
        this.preferences = preferences;
        this.usage = usage;
        this.client = client;
        this.config = config;
    }

    public Mono<WebSearchResponse> search(long user, long token, String query, String requestId) {
        return Mono.defer(() -> {
            authorize(user);
            if (!capacity.tryAcquire()) return Mono.just(WebSearchResponse.degraded());
            return Mono.using(() -> reserve(user, token, requestId),
                    lease -> execute(user, query, requestId, lease), UsageLease::close)
                    .doFinally(signal -> capacity.release());
        }).subscribeOn(Schedulers.boundedElastic());
    }

    private UsageLease reserve(long user, long token, String requestId) {
        UsageLease lease = usage.startForSession(user, requestId, "knowledge", token);
        try {
            usage.describeModel(user, requestId, "knowledge", "tavily-search");
            return lease;
        } catch (RuntimeException error) {
            lease.fail();
            throw error;
        }
    }

    private Mono<WebSearchResponse> execute(long user, String query, String requestId, UsageLease lease) {
        if (!config.enabled()) {
            lease.fail();
            return Mono.just(WebSearchResponse.degraded());
        }
        Sinks.One<WebSearchResponse> expired = Sinks.one();
        lease.watch(() -> expired.tryEmitError(inactive()));
        return client.search(query).onErrorResume(error -> {
            lease.fail();
            org.slf4j.LoggerFactory.getLogger(WebSearchServiceImpl.class).warn(
                    "Web search failed user={} request={} exception={}", user, requestId,
                    error.getClass().getSimpleName());
            return Mono.just(WebSearchResponse.degraded());
        }).takeUntilOther(expired.asMono()).publishOn(Schedulers.boundedElastic()).map(result -> {
            if (!usage.active(user, lease.sessionId())) throw inactive();
            authorize(user);
            if (!"degraded".equals(result.status())) lease.complete();
            return result;
        });
    }

    private void authorize(long user) {
        if (!desktop.advanced(user) || !Boolean.TRUE.equals(preferences.get(user).preferences().webSearchEnabled()))
            throw new ApiException(HttpStatus.FORBIDDEN, "WEB_SEARCH_FORBIDDEN", "当前账号未获授权或未开启联网搜索。");
    }

    private ApiException inactive() {
        return new ApiException(HttpStatus.CONFLICT, "INTERVIEW_NOT_ACTIVE", "面试已结束，请重新开始面试。");
    }
}
