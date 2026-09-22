package com.interview.copilot.request.background;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record ExtractHotwordsRequest(
        @Size(max = 36) String resumeId,
        @Size(max = 36) String targetId,
        @NotNull @Size(max = 30) List<@NotNull @Size(max = 36) String> referenceIds) {}
