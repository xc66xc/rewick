package com.interview.copilot.service.platform;

import com.interview.copilot.request.platform.PlatformConfigRequest;
import com.interview.copilot.response.platform.PlatformConfigResponse;

public interface AdminPlatformConfigService {
    PlatformConfigResponse get();

    PlatformConfigResponse publish(long actor, PlatformConfigRequest input);
}
