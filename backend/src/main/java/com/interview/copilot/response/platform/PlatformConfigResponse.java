package com.interview.copilot.response.platform;

import com.interview.copilot.model.platform.PlatformConfig.Asr;
import com.interview.copilot.model.platform.PlatformConfig.WebSearch;
import com.interview.copilot.model.platform.PlatformConfig.Embedding;
import com.interview.copilot.model.platform.PlatformConfig.Model;
import com.interview.copilot.model.platform.PlatformConfig.Provider;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record PlatformConfigResponse(
        @Min(0) long version,
        @NotNull @Size(max = 50) List<@NotNull @Valid Provider> providers,
        @NotNull @Size(max = 100) List<@NotNull @Valid Model> models,
        @NotNull @Size(max = 64) String defaultModelId,
        @NotNull @Valid Asr asr,
        @Valid Embedding embedding,
        @Valid WebSearch webSearch) {
    @Override
    public String toString() {
        return "PlatformConfigResponse[redacted]";
    }
}
