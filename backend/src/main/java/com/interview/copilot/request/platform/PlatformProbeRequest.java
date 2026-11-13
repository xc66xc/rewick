package com.interview.copilot.request.platform;

import com.interview.copilot.model.platform.PlatformConfig;

public record PlatformProbeRequest(PlatformConfig config, String capability, String modelId, String resultFormat) {
    public PlatformProbeRequest(PlatformConfig config, String capability, String modelId) {
        this(config, capability, modelId, null);
    }
}
