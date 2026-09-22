package com.interview.copilot.controller.background;

import com.interview.copilot.request.background.ExtractHotwordsRequest;
import com.interview.copilot.response.background.ExtractHotwordsResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.background.HotwordExtractionService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HotwordExtractionController {
    private final HotwordExtractionService service;

    public HotwordExtractionController(HotwordExtractionService service) {
        this.service = service;
    }

    @PostMapping("/api/v1/background/hotwords/extract")
    public ExtractHotwordsResponse extract(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody ExtractHotwordsRequest request) {
        return new ExtractHotwordsResponse(service.extract(
                user.id(), request.resumeId(), request.targetId(), request.referenceIds()));
    }
}
