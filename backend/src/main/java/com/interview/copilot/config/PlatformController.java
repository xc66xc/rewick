package com.interview.copilot.config;

import com.interview.copilot.ai.ProviderProperties;
import com.interview.copilot.auth.AuthService;
import com.interview.copilot.auth.UserPrincipal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/platform")
public class PlatformController {
    private final ProviderProperties providers;
    private final PlatformLimitsProperties limits;

    public PlatformController(ProviderProperties providers, PlatformLimitsProperties limits) {
        this.providers = providers;
        this.limits = limits;
    }

    @GetMapping
    public PlatformResponse platform(@AuthenticationPrincipal UserPrincipal user) {
        var summary = providers.summary();
        return new PlatformResponse(new AuthService.PublicUser(Long.toString(user.id()), user.username()),
                new Capabilities(summary.llmEnabled(), summary.asrEnabled(), summary.knowledgeEnabled()),
                new Models(summary.defaultModel(), summary.asrModel()), limits);
    }

    public record Capabilities(boolean llm, boolean asr, boolean knowledge) {}
    public record Models(String llm, String asr) {}
    public record PlatformResponse(AuthService.PublicUser user, Capabilities capabilities,
            Models models, PlatformLimitsProperties limits) {}
}
