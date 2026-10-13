package com.interview.copilot.controller.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.ai.LlmService;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class LlmController {
    private final LlmService proxy;
    private final com.interview.copilot.service.operations.OperationsService operations;

    public LlmController(LlmService proxy,com.interview.copilot.service.operations.OperationsService operations) {
        this.operations=operations;
        this.proxy = proxy;
    }

    @PostMapping("/api/v1/llm/chat/completions")
    public Object complete(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestBody JsonNode body,
            @RequestHeader(value = "X-Request-Id", required = false) String requestId,
            @RequestHeader(value="X-Operation-Id",required=false) String operationId,
            @RequestHeader(value="X-Parent-Span-Id",required=false) String parentSpanId) {
        return proxy.execute(user.id(),requestId,body,operations.start(user.id(),operationId,parentSpanId,requestId,null,"llm",null));
    }
}
