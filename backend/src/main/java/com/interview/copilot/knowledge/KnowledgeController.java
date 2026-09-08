package com.interview.copilot.knowledge;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.auth.UserPrincipal;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class KnowledgeController {
    private final KnowledgeProxy proxy;
    public KnowledgeController(KnowledgeProxy proxy) { this.proxy = proxy; }

    @PostMapping("/api/v1/knowledge/search")
    public Map<String, Object> search(@AuthenticationPrincipal UserPrincipal user, @RequestBody JsonNode body,
                                     @RequestHeader(value = "X-Request-Id", required = false) String requestId) {
        return proxy.search(user.id(), requestId, body);
    }
}
