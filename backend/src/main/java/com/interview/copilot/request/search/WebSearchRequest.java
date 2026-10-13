package com.interview.copilot.request.search;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record WebSearchRequest(
        @NotBlank @Size(max = 20000) String query,
        @NotBlank @Pattern(regexp = "[A-Za-z0-9._:-]{1,128}") String requestId) {}
