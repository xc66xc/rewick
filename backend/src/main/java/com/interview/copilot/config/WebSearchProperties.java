package com.interview.copilot.config;

import jakarta.annotation.PostConstruct;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import java.net.URI;

@ConfigurationProperties("copilot.web-search")
public record WebSearchProperties(
        @DefaultValue("false") boolean enabled,
        @DefaultValue("https://api.tavily.com/search") String url,
        @DefaultValue("") String apiKey,
        @DefaultValue("5") int topK,
        @DefaultValue("advanced") String searchDepth,
        @DefaultValue("8000") int timeoutMs) {
    @PostConstruct
    public void validate() {
        if (topK < 1 || topK > 20 || timeoutMs < 1000 || timeoutMs > 30000)
            throw new IllegalArgumentException("联网搜索 top-k 应为 1–20，timeout-ms 应为 1000–30000。");
        if (!"basic".equals(searchDepth) && !"advanced".equals(searchDepth))
            throw new IllegalArgumentException("联网搜索 search-depth 应为 basic 或 advanced。");
        if (!enabled) return;
        URI endpoint = URI.create(url);
        if (!"https".equals(endpoint.getScheme()) || endpoint.getHost() == null
                || endpoint.getUserInfo() != null || endpoint.getFragment() != null
                || endpoint.getQuery() != null || !"/search".equals(endpoint.getPath()))
            throw new IllegalArgumentException("联网搜索 url 必须为完整 HTTPS /search 接口地址。");
        if (apiKey == null || apiKey.isBlank())
            throw new IllegalArgumentException("联网搜索启用时必须配置 api-key。");
    }

    @Override
    public String toString() {
        return "WebSearchProperties[enabled=" + enabled + ",topK=" + topK + ",timeoutMs=" + timeoutMs + "]";
    }
}
