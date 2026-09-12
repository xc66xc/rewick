package com.interview.copilot.service.impl.email;

import com.interview.copilot.common.email.SmtpTransport;
import com.interview.copilot.dto.email.EmailConfiguration;
import com.interview.copilot.exception.email.EmailErrors;
import com.interview.copilot.response.email.EmailProbeResponse;
import com.interview.copilot.security.email.EmailConfigurationRules;
import com.interview.copilot.service.audit.AuditService;
import com.interview.copilot.service.email.EmailConfigurationService;
import com.interview.copilot.service.email.EmailProbeService;

import jakarta.mail.MessagingException;

import org.springframework.mail.MailException;
import org.springframework.stereotype.Service;

import java.util.concurrent.Semaphore;

@Service
public class EmailProbeServiceImpl implements EmailProbeService {
    private final EmailConfigurationService configurations;
    private final SmtpTransport transport;
    private final AuditService audit;
    private final Semaphore running = new Semaphore(2);

    public EmailProbeServiceImpl(
            EmailConfigurationService configurations, SmtpTransport transport, AuditService audit) {
        this.configurations = configurations;
        this.transport = transport;
        this.audit = audit;
    }

    public EmailProbeResponse test(long actorId, EmailConfiguration config) {
        var draft = configurations.draft(config);
        EmailConfigurationRules.complete(draft.smtp());
        if (!running.tryAcquire()) throw EmailErrors.limited();
        long started = System.nanoTime();
        try {
            transport.testConnection(draft.smtp());
            return new EmailProbeResponse(true, "邮件服务器连接及认证成功，未发送邮件。", elapsed(started));
        } catch (MessagingException | MailException error) {
            return new EmailProbeResponse(false, "邮件服务器连接失败，请检查地址、认证信息和加密方式。", elapsed(started));
        } finally {
            running.release();
            audit.record(actorId, "email.config.test", "smtp");
        }
    }

    private long elapsed(long started) {
        return (System.nanoTime() - started) / 1000000;
    }
}
