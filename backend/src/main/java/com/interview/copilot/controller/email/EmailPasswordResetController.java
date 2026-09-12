package com.interview.copilot.controller.email;

import com.interview.copilot.request.email.EmailCodeRequest;
import com.interview.copilot.request.email.EmailRegisterRequest;
import com.interview.copilot.response.email.EmailCodeResponse;
import com.interview.copilot.service.email.EmailAccountService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth/password-reset")
public class EmailPasswordResetController {
    private final EmailAccountService service;

    public EmailPasswordResetController(EmailAccountService service) {
        this.service = service;
    }

    @PostMapping("/email-code")
    public EmailCodeResponse code(
            @Valid @RequestBody EmailCodeRequest body, HttpServletRequest request) {
        return service.resetCode(request.getRemoteAddr(), body.email());
    }

    @PostMapping
    public ResponseEntity<Void> reset(
            @Valid @RequestBody EmailRegisterRequest body, HttpServletRequest request) {
        service.resetPassword(request.getRemoteAddr(), body.email(), body.password(), body.code());
        return ResponseEntity.noContent().build();
    }
}
