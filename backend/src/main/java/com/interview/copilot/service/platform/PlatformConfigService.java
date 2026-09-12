package com.interview.copilot.service.platform;

import com.interview.copilot.model.platform.PlatformConfig;
import com.interview.copilot.model.platform.PlatformSnapshot;

public interface PlatformConfigService extends PlatformRuntimeService {
    PlatformConfig get();

    PlatformSnapshot snapshot();

    PlatformConfig publish(long actorId, PlatformConfig input);

    PlatformSnapshot draft(PlatformConfig input);
}
