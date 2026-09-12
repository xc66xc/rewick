package com.interview.copilot.response.platform;

import com.interview.copilot.response.auth.PublicUserResponse;

public record PlatformResponse(
        PublicUserResponse user,
        PlatformCapabilitiesResponse capabilities,
        PlatformModelsResponse models,
        PlatformLimitsResponse limits,
        PlatformServicesResponse services) {}
