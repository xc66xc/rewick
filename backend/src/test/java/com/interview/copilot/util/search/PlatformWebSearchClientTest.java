package com.interview.copilot.util.search;

import com.interview.copilot.model.search.WebSearchEndpoint;
import com.interview.copilot.response.search.WebSearchResponse;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class PlatformWebSearchClientTest {
    private final TavilySearchClient tavily = mock(TavilySearchClient.class);
    private final DeepSeekSearchClient deepseek = mock(DeepSeekSearchClient.class);
    private final PlatformWebSearchClient client = new PlatformWebSearchClient(tavily, deepseek);

    @Test
    void search_deepSeekFailure_neverFallsBackToTavily() {
        var endpoint = endpoint("deepseek");
        when(deepseek.search("query", endpoint)).thenReturn(Mono.error(new IllegalStateException("provider unavailable")));

        assertThatThrownBy(() -> client.search("query", endpoint).block()).isInstanceOf(IllegalStateException.class);
        verify(deepseek).search("query", endpoint);
        verifyNoInteractions(tavily);
    }

    @Test
    void search_legacyTavily_onlyCallsTavily() {
        var endpoint = endpoint("tavily");
        when(tavily.search("query", endpoint)).thenReturn(Mono.just(new WebSearchResponse("empty", null, List.of())));

        assertThat(client.search("query", endpoint).block().status()).isEqualTo("empty");
        verifyNoInteractions(deepseek);
    }

    @Test
    void search_unknownProtocol_rejectsWithoutCallingAnyProvider() {
        assertThatThrownBy(() -> client.search("query", endpoint("unknown")).block())
                .isInstanceOf(com.interview.copilot.exception.ApiException.class);
        verifyNoInteractions(tavily, deepseek);
    }

    private WebSearchEndpoint endpoint(String protocol) {
        return new WebSearchEndpoint(true, "https://search.example/search", "fixture-key", 4, "advanced", 8000,
                "none", protocol);
    }
}
