package com.interview.copilot.controller.knowledge;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.knowledge.KnowledgeService;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class KnowledgeController {
    private final KnowledgeService proxy;

    public KnowledgeController(KnowledgeService proxy) {
        this.proxy = proxy;
    }

    @PostMapping("/api/v1/knowledge/search")
    public Map<String, Object> search(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestBody JsonNode body,
            @RequestHeader(value = "X-Request-Id", required = false) String requestId) {
        return proxy.search(user.id(), requestId, body);
    }
}
