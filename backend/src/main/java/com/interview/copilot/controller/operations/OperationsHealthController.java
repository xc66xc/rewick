package com.interview.copilot.controller.operations;

import com.interview.copilot.service.operations.OperationsHealthService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;

@RestController
public class OperationsHealthController {
    private final OperationsHealthService health;
    public OperationsHealthController(OperationsHealthService health) {this.health=health;}
    @GetMapping("/actuator/health")
    public org.springframework.http.ResponseEntity<Map<String,String>> businessHealth() {
        var result=health.businessHealth();return org.springframework.http.ResponseEntity.status("UP".equals(result.get("status"))?200:503).body(result);
    }
}
