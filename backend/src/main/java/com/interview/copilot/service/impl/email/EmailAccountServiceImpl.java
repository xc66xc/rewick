package com.interview.copilot.service.impl.email;

import com.interview.copilot.config.EmailAuthProperties;
import com.interview.copilot.response.auth.LoginResponse;
import com.interview.copilot.response.email.EmailCodeResponse;
import com.interview.copilot.security.email.EmailAddress;
import com.interview.copilot.security.email.EmailRateLimiter;
import com.interview.copilot.service.email.EmailAccountService;
import com.interview.copilot.service.email.EmailAuthService;
import com.interview.copilot.service.email.EmailPasswordResetService;

import org.springframework.stereotype.Service;

@Service
public class EmailAccountServiceImpl implements EmailAccountService {
    private final EmailAuthService registration;
    private final EmailPasswordResetService reset;
    private final EmailRateLimiter limiter;
    private final EmailAuthProperties policy;

    public EmailAccountServiceImpl(
            EmailAuthService registration,
            EmailPasswordResetService reset,
            EmailRateLimiter limiter,
            EmailAuthProperties policy) {
        this.registration = registration;
        this.reset = reset;
        this.limiter = limiter;
        this.policy = policy;
    }

    public EmailCodeResponse registrationCode(String address, String email) {
        limiter.send(address);
        registration.sendCode(EmailAddress.normalize(email));
        return codeResponse();
    }

    public EmailCodeResponse resetCode(String address, String email) {
        limiter.send(address);
        reset.sendCode(EmailAddress.normalize(email));
        return codeResponse();
    }

    public LoginResponse register(
            String address, String email, String password, String code, String invitationCode) {
        limiter.register(address);
        return registration.register(EmailAddress.normalize(email), password, code, invitationCode);
    }

    public void resetPassword(String address, String email, String password, String code) {
        limiter.register(address);
        reset.resetPassword(EmailAddress.normalize(email), password, code);
    }

    private EmailCodeResponse codeResponse() {
        return new EmailCodeResponse(policy.resendSeconds(), policy.codeTtlSeconds());
    }
}
