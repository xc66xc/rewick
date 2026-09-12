package com.interview.copilot.controller.wallet;

import com.interview.copilot.request.wallet.StartInterviewRequest;
import com.interview.copilot.response.wallet.WalletResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.wallet.WalletService;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class WalletController {
    private final WalletService service;

    public WalletController(WalletService service) {
        this.service = service;
    }

    @GetMapping("/api/v1/wallet")
    public WalletResponse state(@AuthenticationPrincipal UserPrincipal user) {
        return service.state(user.id());
    }

    @PostMapping("/api/v1/interview-sessions/start")
    public WalletResponse start(
            @AuthenticationPrincipal UserPrincipal user, @RequestBody StartInterviewRequest body) {
        return service.start(user.id(), body.requestId());
    }

    @PostMapping("/api/v1/interview-sessions/{id}/heartbeat")
    public WalletResponse heartbeat(
            @AuthenticationPrincipal UserPrincipal user, @PathVariable String id) {
        return service.heartbeat(user.id(), id);
    }

    @PostMapping("/api/v1/interview-sessions/{id}/end")
    public WalletResponse end(
            @AuthenticationPrincipal UserPrincipal user, @PathVariable String id) {
        return service.end(user.id(), id);
    }
}
