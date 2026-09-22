package com.interview.copilot.controller.recording;

import com.interview.copilot.exception.ApiException;
import com.interview.copilot.request.recording.RecordingReviewRequest;
import com.interview.copilot.response.recording.RecordingReviewResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.recording.RecordingReviewService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class RecordingReviewController {
    private final RecordingReviewService service;

    public RecordingReviewController(RecordingReviewService service) { this.service = service; }

    @PostMapping("/api/v1/recording-reviews/summarize")
    public RecordingReviewResponse summarize(@AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody RecordingReviewRequest request) {
        requireUser(user);
        return new RecordingReviewResponse(service.summarize(user.id(), request.transcript()));
    }

    private void requireUser(UserPrincipal user) {
        if (user == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "请先登录。");
    }
}
