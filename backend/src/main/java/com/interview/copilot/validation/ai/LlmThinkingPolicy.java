package com.interview.copilot.validation.ai;

import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.exception.ai.ProviderErrors;
import java.net.URI;
import java.util.Map;
import java.util.Set;

/** Platform-owned model settings, never client-supplied inference parameters. */
public final class LlmThinkingPolicy {
    private LlmThinkingPolicy() {}

    public static String suggestProtocol(String url) {
        try {
            String host = URI.create(url).getHost();
            if (host == null) return "none";
            host = host.toLowerCase(java.util.Locale.ROOT);
            if (host.equals("api.deepseek.com")) return "deepseek";
            if (Set.of("dashscope.aliyuncs.com", "dashscope-intl.aliyuncs.com", "dashscope-us.aliyuncs.com").contains(host)
                    || host.endsWith(".maas.aliyuncs.com")) return "bailian";
            return "none";
        } catch (IllegalArgumentException error) { return "none"; }
    }

    public static void apply(Map<String, Object> body, ProviderProperties.Llm config, String mode) {
        String protocol = config.getThinkingProtocol();
        if (!Set.of("default", "disabled", "enabled").contains(mode)
                || !Set.of("none", "bailian", "deepseek").contains(protocol)) throw ProviderErrors.invalid();
        body.remove("thinking");
        body.remove("enable_thinking");
        if ("default".equals(mode)) return;
        switch (protocol) {
            case "bailian" -> body.put("enable_thinking", "enabled".equals(mode));
            case "deepseek" -> body.put("thinking", Map.of("type", mode));
            default -> throw ProviderErrors.invalid();
        }
    }

    /** Bailian defaults may enable thinking; collect SSE for non-streaming application consumers. */
    public static boolean requiresStreaming(ProviderProperties.Llm config) {
        return "enabled".equals(config.getThinkingMode())
                || (("bailian".equals(config.getThinkingProtocol()) || "bailian".equals(suggestProtocol(config.getUrl())))
                        && "default".equals(config.getThinkingMode()));
    }
}
