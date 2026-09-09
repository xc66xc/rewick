package com.interview.copilot.auth.email;

import com.interview.copilot.admin.audit.AuditService;
import jakarta.mail.MessagingException;
import java.util.concurrent.Semaphore;
import org.springframework.mail.MailException;
import org.springframework.stereotype.Service;

@Service
public class EmailConfigurationProbe {
    private final EmailConfigurationService configurations;
    private final SmtpTransport transport;
    private final AuditService audit;
    private final Semaphore running = new Semaphore(2);

    public EmailConfigurationProbe(EmailConfigurationService configurations, SmtpTransport transport, AuditService audit) {
        this.configurations = configurations;
        this.transport = transport;
        this.audit = audit;
    }

    public Result test(long actorId, EmailConfiguration config) {
        var draft = configurations.draft(config);
        EmailConfigurationRules.complete(draft.smtp());
        if (!running.tryAcquire()) throw EmailErrors.limited();
        long started = System.nanoTime();
        try {
            transport.testConnection(draft.smtp());
            return new Result(true, "邮件服务器连接及认证成功，未发送邮件。", elapsed(started));
        } catch (MessagingException | MailException error) {
            return new Result(false, "邮件服务器连接失败，请检查地址、认证信息和加密方式。", elapsed(started));
        } finally {
            running.release();
            audit.record(actorId, "email.config.test", "smtp");
        }
    }

    private long elapsed(long started) { return (System.nanoTime() - started) / 1000000; }
    public record Result(boolean success, String message, long latencyMs) {}
}
