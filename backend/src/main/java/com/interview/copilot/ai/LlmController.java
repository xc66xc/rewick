package com.interview.copilot.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.auth.UserPrincipal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class LlmController {
    private final LlmProxy proxy;
    public LlmController(LlmProxy proxy) { this.proxy = proxy; }

    @PostMapping("/api/v1/llm/chat/completions")
    public Object complete(@AuthenticationPrincipal UserPrincipal user, @RequestBody JsonNode body,
                           @RequestHeader(value = "X-Request-Id", required = false) String requestId) {
        return proxy.execute(user.id(), requestId, body);
    }
}
