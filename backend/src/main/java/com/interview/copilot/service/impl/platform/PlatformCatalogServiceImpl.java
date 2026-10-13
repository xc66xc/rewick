package com.interview.copilot.service.impl.platform;

import com.interview.copilot.config.PlatformLimitsProperties;
import com.interview.copilot.response.auth.PublicUserResponse;
import com.interview.copilot.response.platform.PlatformCapabilitiesResponse;
import com.interview.copilot.response.platform.PlatformLimitsResponse;
import com.interview.copilot.response.platform.PlatformModelsResponse;
import com.interview.copilot.response.platform.PlatformResponse;
import com.interview.copilot.response.platform.PlatformServicesResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.platform.DesktopSettingsService;
import com.interview.copilot.service.platform.PlatformCatalogService;
import com.interview.copilot.service.platform.PlatformRuntimeService;

@org.springframework.stereotype.Service
public class PlatformCatalogServiceImpl implements PlatformCatalogService {
    private final com.interview.copilot.config.WebSearchProperties webSearch;
    private final DesktopSettingsService desktop;
    private final PlatformRuntimeService providers;
    private final PlatformLimitsProperties limits;

    public PlatformCatalogServiceImpl(
            PlatformRuntimeService providers,
            PlatformLimitsProperties limits,
            DesktopSettingsService desktop, com.interview.copilot.config.WebSearchProperties webSearch) {
        this.webSearch = webSearch;
        this.desktop = desktop;
        this.providers = providers;
        this.limits = limits;
    }

    public PlatformResponse get(UserPrincipal user) {
        var snapshot = providers.snapshot();
        return new PlatformResponse(
                new PublicUserResponse(
                        Long.toString(user.id()), user.displayName(), user.role(), user.email()),
                new PlatformCapabilitiesResponse(
                        !snapshot.availableModels().isEmpty(),
                        !snapshot.availableAsrServices().isEmpty(),
                        !snapshot.availableKnowledgeServices().isEmpty()),
                new PlatformModelsResponse(
                        snapshot.defaultModelId(),
                        snapshot.asr().getModel(),
                        snapshot.availableModels()),
                new PlatformLimitsResponse(limits.maxAsrSessionSeconds()),
                new PlatformServicesResponse(
                        snapshot.availableAsrServices(), snapshot.availableKnowledgeServices()),
                desktop.advanced(user.id()),
                desktop.get(), webSearch.enabled(), webSearch.timeoutMs());
    }
}
