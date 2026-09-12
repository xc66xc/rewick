package com.interview.copilot.common.email;

import com.interview.copilot.config.EmailAuthProperties;
import com.interview.copilot.config.SmtpProperties;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.exception.email.EmailErrors;
import com.interview.copilot.security.email.EmailCodeSecrets;
import com.interview.copilot.security.email.EmailConfigurationRules;
import com.interview.copilot.service.email.EmailConfigurationService;

import org.springframework.stereotype.Component;

@Component
public class RegistrationMailSender {
    private final EmailConfigurationService configurations;
    private final EmailAuthProperties policy;
    private final EmailCodeSecrets secrets;
    private final SmtpTransport transport;

    public RegistrationMailSender(
            EmailConfigurationService configurations,
            EmailAuthProperties policy,
            EmailCodeSecrets secrets,
            SmtpTransport transport) {
        this.configurations = configurations;
        this.policy = policy;
        this.secrets = secrets;
        this.transport = transport;
    }

    public void requireConfigured() {
        if (!policy.enabled()) throw EmailErrors.unavailable();
        configured();
    }

    public void requireResetConfigured() {
        configured();
    }

    public void send(String email, String code, String purpose) {
        if ("register".equals(purpose)) requireConfigured();
        SmtpProperties smtp = configured();
        transport.send(smtp, email, code, policy.codeTtlSeconds(), purpose);
    }

    private SmtpProperties configured() {
        if (!secrets.isConfigured()) throw EmailErrors.unavailable();
        try {
            EmailConfigurationService.Prepared snapshot = configurations.snapshot();
            if (!snapshot.view().enabled()) throw EmailErrors.unavailable();
            EmailConfigurationRules.complete(snapshot.smtp());
            return snapshot.smtp();
        } catch (ApiException error) {
            throw EmailErrors.unavailable();
        }
    }
}
