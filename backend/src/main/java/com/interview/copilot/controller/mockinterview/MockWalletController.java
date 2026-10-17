package com.interview.copilot.controller.mockinterview;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.mockinterview.MockWalletService;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.security.core.annotation.AuthenticationPrincipal;

@RestController
public class MockWalletController {
 private final MockWalletService wallets;
 public MockWalletController(MockWalletService wallets) {this.wallets=wallets;}
 @GetMapping("/api/v1/mock-wallet") public JsonNode state(@AuthenticationPrincipal UserPrincipal user) {return wallets.state(user.id());}
 @GetMapping("/api/v1/mock-wallet/ledger") public JsonNode ledger(@AuthenticationPrincipal UserPrincipal user,@RequestParam(required=false) Long cursor) {return wallets.ledger(user.id(),cursor);}
 @GetMapping("/api/v1/admin/users/{userId}/mock-wallet") public JsonNode adminState(@PathVariable long userId) {return wallets.state(userId);}
 @PostMapping("/api/v1/admin/users/{userId}/mock-wallet/adjustments") public JsonNode adjust(@AuthenticationPrincipal UserPrincipal actor,@PathVariable long userId,@RequestBody JsonNode input) {return wallets.adjust(actor.id(),userId,input);}
}
