package com.interview.copilot.util.search;

import com.interview.copilot.model.search.WebSearchEndpoint;
import com.interview.copilot.response.search.WebSearchResponse;
import reactor.core.publisher.Mono;

/** One selected search supplier produces the common desktop response. */
public interface WebSearchClient {
    Mono<WebSearchResponse> search(String query, WebSearchEndpoint config);
}
