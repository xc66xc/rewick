package com.interview.copilot.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("copilot.operations")
public record OperationsProperties(@DefaultValue Storage storage,
        @DefaultValue("") String metricsToken,
        @DefaultValue("http://operations-prometheus:9090") String prometheusUrl) {
    public record Storage(@DefaultValue("") String url, @DefaultValue("") String username,
            @DefaultValue("") String password, @DefaultValue("2147483648") long budgetBytes) {
        @Override public String toString() { return "OperationsStorage[credentials=redacted]"; }
    }
    @Override public String toString() { return "OperationsProperties[credentials=redacted]"; }
}
