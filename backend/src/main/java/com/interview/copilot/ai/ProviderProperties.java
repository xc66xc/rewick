package com.interview.copilot.ai;

import java.net.URI;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/** Platform credentials are never serialized into client metadata. */
@Component
@ConfigurationProperties(prefix = "copilot.providers")
public class ProviderProperties {
    private final Llm llm = new Llm();
    private final Knowledge knowledge = new Knowledge();
    private final Asr asr = new Asr();

    public Llm getLlm() { return llm; }
    public Knowledge getKnowledge() { return knowledge; }
    public Asr getAsr() { return asr; }

    public PlatformSummary summary() {
        return new PlatformSummary(llm.isEnabled(), knowledge.isEnabled(), asr.isEnabled(),
                llm.getModel(), llm.models(), asr.getModel());
    }

    public record PlatformSummary(boolean llmEnabled, boolean knowledgeEnabled, boolean asrEnabled,
                                  String defaultModel, List<String> allowedModels, String asrModel) { }

    public static class Endpoint {
        private String url = "";
        private String apiKey = "";

        public String getUrl() { return url; }
        public void setUrl(String value) { url = value == null ? "" : value.trim(); }
        public String getApiKey() { return apiKey; }
        public void setApiKey(String value) { apiKey = value == null ? "" : value.trim(); }

        public boolean isEnabled() {
            return !apiKey.isBlank() && apiKey.length() <= 4096 && !apiKey.matches("(?s).*[\\r\\n].*")
                    && validEndpoint(url);
        }

        protected boolean validEndpoint(String value) {
            try {
                URI uri = URI.create(value);
                if (uri.getHost() == null) { return false; }
                boolean secure = "https".equals(uri.getScheme()) || "wss".equals(uri.getScheme());
                boolean local = List.of("127.0.0.1", "localhost", "[::1]").contains(uri.getHost());
                boolean testProtocol = "http".equals(uri.getScheme()) || "ws".equals(uri.getScheme());
                return uri.getHost() != null && uri.getUserInfo() == null && uri.getFragment() == null
                        && (secure || (local && testProtocol));
            } catch (IllegalArgumentException exception) {
                return false;
            }
        }
    }

    public static class Llm extends Endpoint {
        private String model = "";
        private List<String> allowedModels = List.of();
        private int maxOutputTokens = 2048;
        private int maxConcurrent = 8;
        private int idleTimeoutSeconds = 30;
        private int totalTimeoutSeconds = 180;

        public String getModel() { return model; }
        public void setModel(String value) { model = value == null ? "" : value.trim(); }
        public List<String> getAllowedModels() { return allowedModels; }
        public void setAllowedModels(List<String> value) { allowedModels = value == null ? List.of() : List.copyOf(value); }
        public List<String> models() { return allowedModels.isEmpty() ? List.of(model) : allowedModels; }
        public int getMaxOutputTokens() { return Math.clamp(maxOutputTokens, 1, 8192); }
        public void setMaxOutputTokens(int value) { maxOutputTokens = value; }
        public int getMaxConcurrent() { return Math.clamp(maxConcurrent, 1, 64); }
        public void setMaxConcurrent(int value) { maxConcurrent = value; }
        public int getIdleTimeoutSeconds() { return Math.clamp(idleTimeoutSeconds, 1, 60); }
        public void setIdleTimeoutSeconds(int value) { idleTimeoutSeconds = value; }
        public int getTotalTimeoutSeconds() { return Math.clamp(totalTimeoutSeconds, 1, 300); }
        public void setTotalTimeoutSeconds(int value) { totalTimeoutSeconds = value; }
        @Override public boolean isEnabled() { return super.isEnabled() && !model.isBlank() && models().contains(model); }
    }

    public static class Embedding extends Endpoint {
        private String model = "";
        private int dimensions = 1024;

        public String getModel() { return model; }
        public void setModel(String value) { model = value == null ? "" : value.trim(); }
        public int getDimensions() { return dimensions; }
        public void setDimensions(int value) { dimensions = value; }
        public boolean isLocalWithoutKey() {
            return getApiKey().isBlank() && validEndpoint(getUrl())
                    && List.of("127.0.0.1", "localhost", "[::1]").contains(URI.create(getUrl()).getHost());
        }
        @Override public boolean isEnabled() { return (super.isEnabled() || isLocalWithoutKey()) && !model.isBlank(); }
    }

    public static class Knowledge extends Endpoint {
        private String agentId = "";
        private int timeoutSeconds = 5;

        public String getAgentId() { return agentId; }
        public void setAgentId(String value) { agentId = value == null ? "" : value.trim(); }
        public int getTimeoutSeconds() { return Math.clamp(timeoutSeconds, 1, 30); }
        public void setTimeoutSeconds(int value) { timeoutSeconds = value; }
        @Override public boolean isEnabled() { return super.isEnabled() && !agentId.isBlank(); }
    }

    public static class Asr extends Endpoint {
        private String model = "fun-asr-realtime";
        private int maxDurationSeconds = 3600;

        public String getModel() { return model; }
        public void setModel(String value) { model = value == null ? "" : value.trim(); }
        public int getMaxDurationSeconds() { return Math.clamp(maxDurationSeconds, 1, 7200); }
        public void setMaxDurationSeconds(int value) { maxDurationSeconds = value; }
        @Override public boolean isEnabled() { return super.isEnabled() && !model.isBlank(); }
    }
}
