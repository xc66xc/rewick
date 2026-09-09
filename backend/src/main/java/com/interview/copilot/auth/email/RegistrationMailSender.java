package com.interview.copilot.auth.email;

import com.interview.copilot.common.ApiException;
import org.springframework.stereotype.Component;

@Component
public class RegistrationMailSender {
    private final EmailConfigurationService configurations;
    private final EmailAuthProperties policy;
    private final EmailCodeSecrets secrets;
    private final SmtpTransport transport;

    public RegistrationMailSender(EmailConfigurationService configurations, EmailAuthProperties policy,
            EmailCodeSecrets secrets, SmtpTransport transport) {
        this.configurations = configurations;
        this.policy = policy;
        this.secrets = secrets;
        this.transport = transport;
    }

    public void requireConfigured() { configured(); }

    public void send(String email, String code) {
        SmtpProperties smtp = configured();
        transport.send(smtp, email, code, policy.codeTtlSeconds());
    }

    private SmtpProperties configured() {
        if (!policy.enabled() || !secrets.isConfigured()) throw EmailErrors.unavailable();
        try {
            EmailConfigurationService.Prepared snapshot = configurations.snapshot();
            if (!snapshot.view().enabled()) throw EmailErrors.unavailable();
            EmailConfigurationRules.complete(snapshot.smtp());
            return snapshot.smtp();
        } catch (ApiException error) { throw EmailErrors.unavailable(); }
    }
}
