package com.interview.copilot.validation.recording;

import com.interview.copilot.exception.ApiException;
import org.springframework.http.HttpStatus;

public final class RecordingReviewPolicy {
    private RecordingReviewPolicy() {}

    public static void transcript(String text) {
        if (text == null || text.isBlank() || text.length() > 160000) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "RECORDING_TRANSCRIPT_INVALID", "复盘文字为空或超过长度限制。");
        }
    }
}
