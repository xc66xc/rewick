package com.interview.copilot.controller.mockinterview;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.mockinterview.MockConfigService;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.security.core.annotation.AuthenticationPrincipal;

@RestController
public class AdminMockInterviewController {
 private final MockConfigService configs;
 public AdminMockInterviewController(MockConfigService configs) {this.configs=configs;}
 @GetMapping("/api/v1/admin/mock-interviews/settings") public JsonNode get() {return configs.get();}
 @PutMapping("/api/v1/admin/mock-interviews/settings") public JsonNode save(@AuthenticationPrincipal UserPrincipal actor,@RequestBody JsonNode input) {return configs.save(actor.id(),input);}
 @PostMapping("/api/v1/admin/mock-interviews/settings/test") public JsonNode test(@RequestBody JsonNode input) {return configs.test(input);}
}
