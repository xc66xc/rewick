package com.interview.copilot.request.references;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public record SearchReferenceRequest(
        @NotBlank @Size(max = 20000) String query,
        @NotNull @Size(max = 100) List<@NotNull UUID> referenceIds) {}
