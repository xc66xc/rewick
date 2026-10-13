package com.interview.copilot.util.search;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.model.search.WebSearchEndpoint;
import com.interview.copilot.exception.ai.ProviderErrors;
import com.interview.copilot.response.search.WebExcerptResponse;
import com.interview.copilot.response.search.WebSearchResponse;
import org.springframework.http.MediaType;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;
import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Map;

@Component
public class TavilySearchClient {
    private final WebClient client;

    public TavilySearchClient() {
        this.client = WebClient.builder()
                .clientConnector(new ReactorClientHttpConnector(HttpClient.create().followRedirect(false)))
                .codecs(value -> value.defaultCodecs().maxInMemorySize(2 * 1024 * 1024)).build();
    }

    public Mono<WebSearchResponse> search(String query, WebSearchEndpoint config) {
        Map<String, Object> body = Map.of(
                "query", query, "max_results", config.topK(), "search_depth", config.searchDepth(),
                "include_answer", "none".equals(config.includeAnswer()) ? false : config.includeAnswer(),
                "include_raw_content", false, "include_images", false,
                "auto_parameters", false, "topic", "general");
        return client.post().uri(config.url()).contentType(MediaType.APPLICATION_JSON)
                .headers(headers -> headers.setBearerAuth(config.apiKey())).bodyValue(body)
                .exchangeToMono(response -> {
                    if (!response.statusCode().is2xxSuccessful())
                        return response.releaseBody().then(Mono.error(ProviderErrors.failed()));
                    return response.bodyToMono(JsonNode.class)
                            .switchIfEmpty(Mono.error(ProviderErrors.failed()));
                }).timeout(Duration.ofMillis(config.timeoutMs()))
                .map(response -> extract(response, config.topK(), config.includeAnswer()));
    }

    public WebSearchResponse extract(JsonNode response, int topK) {
        return extract(response, topK, "none");
    }

    public WebSearchResponse extract(JsonNode response, int topK, String includeAnswer) {
        String answer = summary(response, includeAnswer);
        if (!response.path("results").isArray() && answer.isEmpty()) throw ProviderErrors.failed();
        var selected = new ArrayList<JsonNode>();
        Iterable<JsonNode> results = response.path("results").isArray()
                ? response.path("results") : java.util.List.of();
        for (JsonNode result : results) {
            if (selected.size() >= topK) break;
            if (validResult(result)) selected.add(result);
        }
        int count = selected.size() + (answer.isEmpty() ? 0 : 1);
        if (count == 0) return new WebSearchResponse("empty", null, java.util.List.of());
        int budget = Math.min(2000, 8000 / count);
        var excerpts = new ArrayList<WebExcerptResponse>();
        selected.forEach(result -> excerpts.add(excerpt(result, budget)));
        if (!answer.isEmpty()) excerpts.add(summaryExcerpt(answer, budget));
        return new WebSearchResponse("ready", null, java.util.List.copyOf(excerpts));
    }

    private String summary(JsonNode response, String includeAnswer) {
        if ("none".equals(includeAnswer) || !response.path("answer").isTextual()) return "";
        return response.path("answer").asText().trim();
    }

    private WebExcerptResponse summaryExcerpt(String answer, int budget) {
        String text = answer.substring(0, Math.min(answer.length(), budget));
        String title = "Tavily 生成摘要（非网页原文）";
        String identity = fingerprint("tavily-generated-summary\n" + text);
        return new WebExcerptResponse("web", "technical", identity, identity, 1,
                title, title, null, text, null, true);
    }

    private boolean validResult(JsonNode result) {
        return result.path("url").isTextual() && result.path("content").isTextual()
                && validUrl(result.path("url").asText()) && !result.path("content").asText().isBlank();
    }

    private WebExcerptResponse excerpt(JsonNode result, int budget) {
        String url = result.path("url").asText();
        String text = result.path("content").asText().trim();
        text = text.substring(0, Math.min(text.length(), budget));
        String title = result.path("title").asText("");
        title = title.substring(0, Math.min(title.length(), 255));
        Double score = result.path("score").isNumber() ? result.path("score").asDouble() : null;
        if (score != null && !Double.isFinite(score)) score = null;
        String name = title.isBlank() ? url.substring(0, Math.min(url.length(), 255)) : title;
        return new WebExcerptResponse("web", "technical", fingerprint(url),
                fingerprint(url + "\n" + text), 1, name, title, url, text, score);
    }

    private String fingerprint(String text) {
        try {
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(text.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return "web:" + java.util.HexFormat.of().formatHex(digest);
        } catch (java.security.NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 unavailable", error);
        }
    }

    private boolean validUrl(String value) {
        if (value.length() > 2048 || value.chars().anyMatch(Character::isISOControl)) return false;
        try {
            URI uri = URI.create(value);
            return ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))
                    && uri.getHost() != null && uri.getUserInfo() == null;
        } catch (IllegalArgumentException invalid) {
            return false;
        }
    }
}
