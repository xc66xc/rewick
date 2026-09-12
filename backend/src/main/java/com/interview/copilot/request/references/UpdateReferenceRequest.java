package com.interview.copilot.request.references;

import jakarta.validation.constraints.Pattern;

public record UpdateReferenceRequest(
        Boolean enabled, @Pattern(regexp = "technical|personal") String kind) {}
