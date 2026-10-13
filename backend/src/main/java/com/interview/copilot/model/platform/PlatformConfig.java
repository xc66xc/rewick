package com.interview.copilot.model.platform;

import com.fasterxml.jackson.annotation.JsonProperty;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public record PlatformConfig(
        @Min(0) long version,
        @NotNull @Size(max = 50) List<@NotNull @Valid Provider> providers,
        @NotNull @Size(max = 100) List<@NotNull @Valid Model> models,
        @NotNull @Size(max = 64) String defaultModelId,
        @NotNull @Valid Asr asr,
        @NotNull @Valid Knowledge knowledge,
        @Valid Embedding embedding,
        @Valid WebSearch webSearch) {
    public PlatformConfig(long version, List<Provider> providers, List<Model> models, String defaultModelId,
            Asr asr, Knowledge knowledge, Embedding embedding) {
        this(version, providers, models, defaultModelId, asr, knowledge, embedding, WebSearch.disabled());
    }
    public PlatformConfig(
            long version,
            List<Provider> providers,
            List<Model> models,
            String defaultModelId,
            Asr asr,
            Knowledge knowledge) {
        this(version, providers, models, defaultModelId, asr, knowledge, null);
    }

    public PlatformConfig {
        if (embedding == null) {
            embedding = new Embedding(false, "", "", 1024);
        }
        if (providers != null) {
            providers = Collections.unmodifiableList(new ArrayList<>(providers));
        }
        if (models != null) {
            models = Collections.unmodifiableList(new ArrayList<>(models));
        }
    }

    public record Provider(
            @NotBlank @Pattern(regexp = "[A-Za-z0-9_.-]{1,64}") String id,
            @NotBlank @Size(max = 120) String name,
            @NotBlank @Pattern(regexp = "llm|asr|knowledge|embedding|web-search") String kind,
            @NotBlank @Size(max = 2048) String url,
            boolean enabled,
            @JsonProperty(access = JsonProperty.Access.READ_ONLY) boolean hasApiKey,
            @Size(max = 4096) @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
                    String apiKey) {
        @Override
        public String toString() {
            return "Provider[id=" + id + ", apiKey=redacted]";
        }
    }

    public record Model(
            @NotBlank @Pattern(regexp = "[A-Za-z0-9_.-]{1,64}") String id,
            @NotBlank @Size(max = 120) String name,
            @NotBlank @Pattern(regexp = "[A-Za-z0-9_.-]{1,64}") String providerId,
            @NotBlank @Size(max = 200) String model,
            boolean enabled,
            @Min(1) @Max(32768) int maxOutputTokens) {}

    public record Embedding(
            boolean enabled,
            @NotNull @Size(max = 64) String providerId,
            @NotNull @Size(max = 200) String model,
            @Min(1024) @Max(1024) int dimensions) {}

    public record WebSearch(
            boolean enabled,
            @NotNull @Size(max = 64) String providerId,
            @Min(1) @Max(20) int topK,
            @NotNull @Pattern(regexp = "basic|advanced") String searchDepth,
            @Min(1000) @Max(30000) int timeoutMs) {
        public static WebSearch disabled() {
            return new WebSearch(false, "", 5, "advanced", 8000);
        }
    }

    public record Asr(
            boolean enabled,
            @NotNull @Size(max = 64) String providerId,
            @NotNull @Size(max = 200) String model) {}

    public record Knowledge(
            boolean enabled,
            @NotNull @Size(max = 64) String providerId,
            @NotNull @Size(max = 200) String agentId) {}
}
