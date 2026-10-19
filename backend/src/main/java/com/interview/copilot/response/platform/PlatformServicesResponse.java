package com.interview.copilot.response.platform;

import com.interview.copilot.model.platform.PlatformSnapshot;

import java.util.List;

public record PlatformServicesResponse(
        List<PlatformSnapshot.AvailableService> asr) {}
