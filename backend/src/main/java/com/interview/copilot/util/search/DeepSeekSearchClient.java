package com.interview.copilot.util.search;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.exception.ai.ProviderErrors;
import com.interview.copilot.model.search.WebSearchEndpoint;
import com.interview.copilot.response.search.WebExcerptResponse;
import com.interview.copilot.response.search.WebSearchResponse;
import org.springframework.http.MediaType;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Component
public final class DeepSeekSearchClient implements WebSearchClient {
    private static final String SUMMARY_NOTICE = "网页摘要（非网页原文）：\n";
    private final WebClient client = WebClient.builder()
            .clientConnector(new ReactorClientHttpConnector(HttpClient.create().followRedirect(false)))
            .codecs(value -> value.defaultCodecs().maxInMemorySize(2 * 1024 * 1024)).build();

    @Override
    public Mono<WebSearchResponse> search(String query, WebSearchEndpoint config) {
        String text = query.strip();
        if (text.isEmpty()) return Mono.error(ProviderErrors.failed());
        text = text.substring(0, text.offsetByCodePoints(0, Math.min(128, text.codePointCount(0, text.length()))));
        Map<String, Object> body = Map.of("query", text, "count", config.topK(), "need_content", false);
        return client.post().uri(config.url()).contentType(MediaType.APPLICATION_JSON)
                .headers(headers -> headers.setBearerAuth(config.apiKey())).bodyValue(body)
                .exchangeToMono(response -> {
                    if (!response.statusCode().is2xxSuccessful())
                        return response.releaseBody().then(Mono.error(ProviderErrors.failed()));
                    return response.bodyToMono(JsonNode.class).switchIfEmpty(Mono.error(ProviderErrors.failed()));
                }).timeout(Duration.ofMillis(config.timeoutMs()))
                .map(response -> extract(response, config.topK()));
    }

    public WebSearchResponse extract(JsonNode response, int topK) {
        if (!response.path("results").isArray()) throw ProviderErrors.failed();
        List<JsonNode> selected = new ArrayList<>();
        for (JsonNode result : response.path("results")) {
            if (selected.size() >= topK) break;
            if (validUrl(result.path("url").asText("")) && !summary(result).isBlank()) selected.add(result);
        }
        if (selected.isEmpty()) return new WebSearchResponse("empty", null, List.of());
        int budget = Math.min(2000, 8000 / selected.size());
        var excerpts = selected.stream().map(result -> excerpt(result, budget)).toList();
        return new WebSearchResponse("ready", null, excerpts);
    }

    private String summary(JsonNode result) {
        String summary = result.path("summary").isTextual() ? result.path("summary").asText().strip() : "";
        if (!summary.isEmpty()) return summary;
        return result.path("snippet").isTextual() ? result.path("snippet").asText().strip() : "";
    }

    private WebExcerptResponse excerpt(JsonNode result, int budget) {
        String url = result.path("url").asText();
        String text = clip(SUMMARY_NOTICE + summary(result), budget);
        String title = clip(result.path("title").asText(""), 255);
        String name = title.isBlank() ? clip(url, 255) : title;
        // DeepSeek relevance scores use a distinct 0..3 scale. Preserve supplier ordering,
        // but do not expose them as a cross-provider confidence or vector similarity.
        return new WebExcerptResponse("web", "technical", fingerprint(url), fingerprint(url + "\n" + text),
                1, name, title, url, text, null);
    }

    private String clip(String value, int limit) {
        int end = Math.min(value.length(), limit);
        if (end > 0 && Character.isHighSurrogate(value.charAt(end - 1))) end--;
        return value.substring(0, end);
    }

    private String fingerprint(String value) {
        try {
            return "web:" + java.util.HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException error) {
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
