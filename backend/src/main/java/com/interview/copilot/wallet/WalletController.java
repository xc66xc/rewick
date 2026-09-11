package com.interview.copilot.wallet;

import com.interview.copilot.auth.UserPrincipal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class WalletController {
    private final WalletService service;
    public WalletController(WalletService service) { this.service=service; }
    @GetMapping("/api/v1/wallet")
    public WalletState state(@AuthenticationPrincipal UserPrincipal user) { return service.state(user.id()); }
    @PostMapping("/api/v1/interview-sessions/start")
    public WalletState start(@AuthenticationPrincipal UserPrincipal user,@RequestBody Start body) { return service.start(user.id(),body.requestId()); }
    @PostMapping("/api/v1/interview-sessions/{id}/heartbeat")
    public WalletState heartbeat(@AuthenticationPrincipal UserPrincipal user,@PathVariable String id) { return service.heartbeat(user.id(),id); }
    @PostMapping("/api/v1/interview-sessions/{id}/end")
    public WalletState end(@AuthenticationPrincipal UserPrincipal user,@PathVariable String id) { return service.end(user.id(),id); }
    public record Start(String requestId) {}
}
