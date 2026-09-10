package com.interview.copilot.config;

import com.interview.copilot.auth.AuthService;
import com.interview.copilot.auth.UserPrincipal;
import com.interview.copilot.platform.PlatformRuntimeResolver;
import com.interview.copilot.platform.PlatformSnapshot;
import com.interview.copilot.usage.UserLimitsService;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/platform")
public class PlatformController {
    private final PlatformRuntimeResolver providers;
    private final UserLimitsService limits;

    public PlatformController(PlatformRuntimeResolver providers, UserLimitsService limits) {
        this.providers = providers;
        this.limits = limits;
    }

    @GetMapping
    public PlatformResponse platform(@AuthenticationPrincipal UserPrincipal user) {
        var snapshot = providers.snapshot();
        return new PlatformResponse(new AuthService.PublicUser(Long.toString(user.id()), user.displayName(), user.role(), user.email()),
                new Capabilities(!snapshot.availableModels().isEmpty(), !snapshot.availableAsrServices().isEmpty(), !snapshot.availableKnowledgeServices().isEmpty()),
                new Models(snapshot.defaultModelId(), snapshot.asr().getModel(), snapshot.availableModels()), limits.effective(user.id()),
                new Services(snapshot.availableAsrServices(), snapshot.availableKnowledgeServices()));
    }

    public record Capabilities(boolean llm, boolean asr, boolean knowledge) {}
    public record Models(String llm, String asr, List<PlatformSnapshot.AvailableModel> available) {}
    public record Services(List<PlatformSnapshot.AvailableService> asr, List<PlatformSnapshot.AvailableService> knowledge) {}
    public record PlatformResponse(AuthService.PublicUser user, Capabilities capabilities,
            Models models, UserLimitsService.EffectiveLimits limits, Services services) {}
}
