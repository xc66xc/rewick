package com.interview.copilot.controller.operations;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.model.operations.OperationsSettings;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.operations.OperationsService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;

@RestController
public class OperationsController {
    private final OperationsService operations;
    public OperationsController(OperationsService operations) {this.operations=operations;}
    @GetMapping("/api/v1/telemetry/settings")
    public Map<String,Object> enabled(@AuthenticationPrincipal UserPrincipal user) {return Map.of("enabled",operations.enabled(user.id()));}
    @PostMapping("/api/v1/telemetry/operations")
    @ResponseStatus(org.springframework.http.HttpStatus.ACCEPTED)
    public Map<String,Object> ingest(@AuthenticationPrincipal UserPrincipal user,@RequestBody JsonNode input) {return operations.ingest(user.id(),input);}
    @GetMapping("/api/v1/admin/operations/settings")
    public OperationsSettings settings() {return operations.settings();}
    @PutMapping("/api/v1/admin/operations/settings")
    public OperationsSettings save(@AuthenticationPrincipal UserPrincipal user,@RequestBody JsonNode input) {return operations.saveInput(user.id(),input);}
    @GetMapping("/api/v1/admin/operations/overview")
    public Map<String,Object> overview(@RequestParam(defaultValue="24") int hours) {return operations.overview(hours);}
    @GetMapping("/api/v1/admin/operations/performance")
    public Map<String,Object> performance(@RequestParam(defaultValue="24") int hours) {return operations.performance(hours);}
    @GetMapping("/api/v1/admin/operations/traces")
    public Map<String,Object> traces(@RequestParam(defaultValue="24") int hours,@RequestParam(required=false) Long userId,
            @RequestParam(required=false) String sessionId,@RequestParam(required=false) String model,@RequestParam(required=false) String appVersion,
            @RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size) {
        return operations.traces(hours,userId,sessionId,model,appVersion,page,size);
    }
    @GetMapping("/api/v1/admin/operations/traces/{operationId}")
    public Map<String,Object> detail(@PathVariable String operationId,@RequestParam long userId) {return operations.detail(operationId,userId);}
    @GetMapping("/api/v1/admin/operations/health")
    public Map<String,Object> health() {return operations.health();}
}
