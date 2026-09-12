package com.interview.copilot.request.email;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record EmailCodeRequest(@NotBlank @Size(max = 254) String email) {}
