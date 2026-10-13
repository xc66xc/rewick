package com.interview.copilot.service.search;

import com.interview.copilot.response.search.WebSearchResponse;
import reactor.core.publisher.Mono;

public interface WebSearchService {
    Mono<WebSearchResponse> search(long user, long token, String query, String requestId);
}
