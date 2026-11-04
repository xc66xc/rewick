package com.interview.copilot.request.screenshots;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ScreenshotRequest(@NotNull @Size(max = 8 * 1024 * 1024 + 32) String image) {
    @Override
    public String toString() {
        return "ScreenshotRequest[image=redacted]";
    }
}
