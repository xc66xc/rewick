package com.interview.copilot.model.platform;

import jakarta.validation.Validation;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class PlatformConfigSearchDepthTest {
    @ParameterizedTest
    @ValueSource(strings = {"advanced", "basic", "fast", "ultra-fast"})
    void validate_supportedSearchDepth_acceptsConfiguration(String depth) {
        var settings = new PlatformConfig.WebSearch(true, "tavily", 5, depth, 8000, "none");

        try (var factory = Validation.buildDefaultValidatorFactory()) {
            assertThat(factory.getValidator().validate(settings)).isEmpty();
        }
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"quick", "ultra_fast", "FAST", "", "fast "})
    void validate_unsupportedSearchDepth_rejectsConfiguration(String depth) {
        var settings = new PlatformConfig.WebSearch(true, "tavily", 5, depth, 8000, "none");

        try (var factory = Validation.buildDefaultValidatorFactory()) {
            assertThat(factory.getValidator().validate(settings)).isNotEmpty();
        }
    }
}
