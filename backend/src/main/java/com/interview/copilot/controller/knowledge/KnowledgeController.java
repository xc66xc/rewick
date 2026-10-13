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
    private final com.interview.copilot.service.operations.OperationsService operations;

    public KnowledgeController(KnowledgeService proxy,com.interview.copilot.service.operations.OperationsService operations) {
        this.operations=operations;
        this.proxy = proxy;
    }

    @PostMapping("/api/v1/knowledge/search")
    public Map<String, Object> search(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestBody JsonNode body,
            @RequestHeader(value = "X-Request-Id", required = false) String requestId,
            @RequestHeader(value="X-Operation-Id",required=false) String operation,
            @RequestHeader(value="X-Parent-Span-Id",required=false) String parent) {
        return proxy.search(user.id(),requestId,body,operations.start(user.id(),operation,parent,requestId,null,"bailian",null));
    }
}
