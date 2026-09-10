package com.interview.copilot.auth.email;

import com.interview.copilot.common.ApiException;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class RegistrationMailSenderTest {
    @Test void send_configuredDatabaseSnapshot_usesCurrentSettingsAndNoEnvironmentFallback() {
        var configurations = mock(EmailConfigurationService.class);
        var transport = mock(SmtpTransport.class);
        var smtp = EmailTestData.smtp();
        when(configurations.snapshot()).thenReturn(snapshot(true, smtp));
        var sender = sender(configurations, EmailTestData.policy(), transport);
        sender.send("alice@example.com", "582916", "register");
        verify(transport).send(smtp, "alice@example.com", "582916", 600, "register");

        when(configurations.snapshot()).thenReturn(snapshot(false, smtp));
        assertThatThrownBy(sender::requireConfigured).isInstanceOf(ApiException.class);
    }

    @Test void send_disabledDeploymentOrDatabase_neverContactsSmtp() {
        var configurations = mock(EmailConfigurationService.class);
        var transport = mock(SmtpTransport.class);
        var disabled = new EmailAuthProperties(false, EmailTestData.SECRET, 600, 60, 5, 5, 20, 30);
        assertThatThrownBy(() -> sender(configurations, disabled, transport).send("alice@example.com", "123456", "register")).isInstanceOf(ApiException.class);
        when(configurations.snapshot()).thenReturn(snapshot(false, EmailTestData.smtp()));
        assertThatThrownBy(() -> sender(configurations, EmailTestData.policy(), transport).requireConfigured()).isInstanceOf(ApiException.class);
        verifyNoInteractions(transport);
    }

    @Test void send_passwordResetWithRegistrationDisabled_stillUsesEnabledSmtp() {
        var configurations = mock(EmailConfigurationService.class);
        var transport = mock(SmtpTransport.class);
        var disabled = new EmailAuthProperties(false, EmailTestData.SECRET, 600, 60, 5, 5, 20, 30);
        var smtp = EmailTestData.smtp();
        when(configurations.snapshot()).thenReturn(snapshot(true, smtp));
        var sender = sender(configurations, disabled, transport);
        sender.requireResetConfigured();
        sender.send("alice@example.com", "123456", "password_reset");
        verify(transport).send(smtp, "alice@example.com", "123456", 600, "password_reset");
    }

    @Test void send_anonymousLoopbackSmtp_doesNotRequireCredentials() {
        var configurations = mock(EmailConfigurationService.class);
        var transport = mock(SmtpTransport.class);
        var smtp = new SmtpProperties("127.0.0.1", 2525, "", "", "mail@example.com", false, false, 5000);
        when(configurations.snapshot()).thenReturn(snapshot(true, smtp));
        sender(configurations, EmailTestData.policy(), transport).send("alice@example.com", "123456", "register");
        verify(transport).send(smtp, "alice@example.com", "123456", 600, "register");
    }

    private RegistrationMailSender sender(EmailConfigurationService configurations, EmailAuthProperties policy, SmtpTransport transport) {
        return new RegistrationMailSender(configurations, policy, new EmailCodeSecrets(policy), transport);
    }
    private EmailConfigurationService.Prepared snapshot(boolean enabled, SmtpProperties smtp) {
        var config = new EmailConfiguration(1, enabled, smtp.host(), smtp.port(), smtp.username(), false, null, smtp.from(), smtp.starttls(), smtp.ssl());
        return new EmailConfigurationService.Prepared(config, smtp);
    }
}
