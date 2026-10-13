package com.interview.copilot.controller.search;

import com.interview.copilot.request.search.WebSearchRequest;
import com.interview.copilot.response.search.WebSearchResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.search.WebSearchService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

@RestController
public class WebSearchController {
    private final WebSearchService search;

    public WebSearchController(WebSearchService search) {
        this.search = search;
    }

    @PostMapping("/api/v1/web-search")
    public Mono<WebSearchResponse> search(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody WebSearchRequest body) {
        return search.search(user.id(), user.tokenId(), body.query(), body.requestId());
    }
}
