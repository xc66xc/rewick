package com.interview.copilot.request.recording;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RecordingReviewRequest(@NotBlank @Size(max = 160000) String transcript) {}
