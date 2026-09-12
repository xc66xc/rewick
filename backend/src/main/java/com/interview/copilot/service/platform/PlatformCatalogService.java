package com.interview.copilot.service.platform;

import com.interview.copilot.response.platform.PlatformResponse;
import com.interview.copilot.security.auth.UserPrincipal;

public interface PlatformCatalogService {
    PlatformResponse get(UserPrincipal user);
}
