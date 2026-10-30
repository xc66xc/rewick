package com.interview.copilot.util.search;

import com.interview.copilot.exception.ai.ProviderErrors;
import com.interview.copilot.model.search.WebSearchEndpoint;
import com.interview.copilot.response.search.WebSearchResponse;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

@Component
@Primary
public final class PlatformWebSearchClient implements WebSearchClient {
    private final TavilySearchClient tavily;
    private final DeepSeekSearchClient deepseek;

    public PlatformWebSearchClient(TavilySearchClient tavily, DeepSeekSearchClient deepseek) {
        this.tavily = tavily;
        this.deepseek = deepseek;
    }

    @Override
    public Mono<WebSearchResponse> search(String query, WebSearchEndpoint config) {
        return switch (config.searchProtocol()) {
            case "tavily" -> tavily.search(query, config);
            case "deepseek" -> deepseek.search(query, config);
            default -> Mono.error(ProviderErrors.failed());
        };
    }
}
