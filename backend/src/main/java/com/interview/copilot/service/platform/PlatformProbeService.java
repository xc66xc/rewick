package com.interview.copilot.service.platform;

import com.interview.copilot.request.platform.PlatformProbeRequest;
import com.interview.copilot.response.platform.PlatformProbeResponse;

public interface PlatformProbeService {
    PlatformProbeResponse test(long actorId, PlatformProbeRequest input);
}
