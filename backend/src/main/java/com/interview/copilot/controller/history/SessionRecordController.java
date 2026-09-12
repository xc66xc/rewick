package com.interview.copilot.controller.history;

import com.interview.copilot.request.history.SaveRecordRequest;
import com.interview.copilot.response.history.RecordPageResponse;
import com.interview.copilot.response.history.RecordResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.history.SessionRecordService;

import jakarta.validation.Valid;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/session-records")
public class SessionRecordController {
    private final SessionRecordService records;

    public SessionRecordController(SessionRecordService records) {
        this.records = records;
    }

    @GetMapping
    public RecordPageResponse page(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestParam(defaultValue = "9223372036854775807") long cursor) {
        return records.page(user.id(), cursor);
    }

    @GetMapping("/{id}")
    public RecordResponse read(
            @AuthenticationPrincipal UserPrincipal user, @PathVariable String id) {
        return records.read(user.id(), id);
    }

    @PostMapping("/{id}")
    public RecordResponse save(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable String id,
            @Valid @RequestBody SaveRecordRequest input) {
        return records.save(
                user.id(), id, input.version(), input.mutationId().toString(), input.record());
    }

    @PostMapping("/{id}/delete")
    public void delete(@AuthenticationPrincipal UserPrincipal user, @PathVariable String id) {
        records.delete(user.id(), id);
    }
}
