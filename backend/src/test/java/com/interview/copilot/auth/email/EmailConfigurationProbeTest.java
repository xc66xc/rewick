package com.interview.copilot.auth.email;

import com.interview.copilot.admin.audit.AuditService;
import jakarta.mail.MessagingException;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class EmailConfigurationProbeTest {
    @Test void testConnection_successAndFailure_returnSafeResultsWithoutPublishingOrSending() throws Exception {
        var service = mock(EmailConfigurationService.class);
        var transport = mock(SmtpTransport.class);
        var audit = mock(AuditService.class);
        var config = new EmailConfiguration(0, false, "smtp.example.com", 587, "user", false, "password", "mail@example.com", true, false);
        var smtp = EmailTestData.smtp();
        when(service.draft(config)).thenReturn(new EmailConfigurationService.Prepared(config, smtp));
        var probe = new EmailConfigurationProbe(service, transport, audit);
        assertThat(probe.test(7, config).success()).isTrue();
        doThrow(new MessagingException("private SMTP secret details")).when(transport).testConnection(smtp);
        var failed = probe.test(7, config);
        assertThat(failed.success()).isFalse();
        assertThat(failed.message()).doesNotContain("private", "secret");
        verify(service, never()).publish(anyLong(), any());
        verify(transport, never()).send(any(), any(), any(), org.mockito.ArgumentMatchers.anyInt());
    }
}
