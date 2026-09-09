package com.interview.copilot.embedding;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.auth.UserPrincipal;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public final class EmbeddingController {
    private final EmbeddingProxy proxy;

    public EmbeddingController(EmbeddingProxy proxy) { this.proxy = proxy; }

    @PostMapping("/api/v1/embeddings")
    public Map<String, Object> embed(@AuthenticationPrincipal UserPrincipal user, @RequestBody JsonNode body,
                                     @RequestHeader(value = "X-Request-Id", required = false) String requestId) {
        return proxy.embed(user.id(), requestId, body);
    }
}
