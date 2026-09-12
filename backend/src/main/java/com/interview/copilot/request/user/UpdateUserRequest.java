package com.interview.copilot.request.user;

import jakarta.validation.constraints.NotNull;

public record UpdateUserRequest(@NotNull Boolean enabled) {}
