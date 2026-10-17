package com.interview.copilot.controller.mockinterview;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.mockinterview.MockInterviewService;
import com.interview.copilot.service.mockinterview.MockConfigService;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import java.util.UUID;

@RestController
public class MockInterviewController {
 private final MockInterviewService interviews;
 private final MockConfigService configs;
 public MockInterviewController(MockInterviewService interviews,MockConfigService configs) {this.interviews=interviews;this.configs=configs;}
 @GetMapping("/api/v1/mock-interviews/capabilities") public JsonNode capabilities(@AuthenticationPrincipal UserPrincipal user) {return configs.capabilities(user.id());}
 @GetMapping("/api/v1/mock-interviews") public JsonNode list(@AuthenticationPrincipal UserPrincipal user) {return interviews.list(user.id());}
 @PostMapping("/api/v1/mock-interviews") public JsonNode create(@AuthenticationPrincipal UserPrincipal user,@RequestBody JsonNode input) {return interviews.create(user.id(),input);}
 @GetMapping("/api/v1/mock-interviews/{id}") public JsonNode get(@AuthenticationPrincipal UserPrincipal user,@PathVariable UUID id) {return interviews.get(user.id(),id);}
 @PostMapping("/api/v1/mock-interviews/{id}/commands") public JsonNode command(@AuthenticationPrincipal UserPrincipal user,@PathVariable UUID id,@RequestBody JsonNode input) {return interviews.command(user.id(),id,input);}
 @GetMapping("/api/v1/mock-interviews/{id}/report") public JsonNode report(@AuthenticationPrincipal UserPrincipal user,@PathVariable UUID id) {return interviews.report(user.id(),id);}
 @PostMapping("/api/v1/mock-interviews/{id}/report-retry") public JsonNode retryReport(@AuthenticationPrincipal UserPrincipal user,@PathVariable UUID id,@RequestBody JsonNode input) {return interviews.retryReport(user.id(),id,input);}
 @DeleteMapping("/api/v1/mock-interviews/{id}") public JsonNode remove(@AuthenticationPrincipal UserPrincipal user,@PathVariable UUID id) {return interviews.remove(user.id(),id);}
}
