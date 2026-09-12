package com.interview.copilot.request.references;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record ReferencePolicyRequest(
        @Min(1) @Max(100) int maxFiles,
        @Min(1048576) @Max(1073741824) long maxTotalBytes,
        @Min(1) @Max(50000) int maxChunks) {}
