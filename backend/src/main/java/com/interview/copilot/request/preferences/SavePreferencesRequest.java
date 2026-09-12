package com.interview.copilot.request.preferences;

import com.interview.copilot.dto.preferences.UserPreferences;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record SavePreferencesRequest(
        @Min(0) long version,
        @NotNull UUID mutationId,
        @NotNull @Valid UserPreferences preferences) {}
