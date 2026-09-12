package com.interview.copilot.request.email;

import com.interview.copilot.dto.email.EmailConfiguration;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

public record EmailProbeRequest(@NotNull @Valid EmailConfiguration config) {}
