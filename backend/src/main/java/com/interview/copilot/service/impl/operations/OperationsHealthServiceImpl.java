package com.interview.copilot.service.impl.operations;

import com.interview.copilot.service.operations.OperationsHealthService;
import org.springframework.boot.actuate.health.HealthEndpoint;
import org.springframework.stereotype.Service;
import java.util.Map;

@Service
public class OperationsHealthServiceImpl implements OperationsHealthService {
    private final HealthEndpoint health;
    public OperationsHealthServiceImpl(HealthEndpoint health) {this.health=health;}
    public Map<String,String> businessHealth() {return Map.of("status",health.health().getStatus().getCode());}
}
