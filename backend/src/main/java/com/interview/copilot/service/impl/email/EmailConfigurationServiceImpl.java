package com.interview.copilot.service.impl.email;

import com.interview.copilot.config.SmtpProperties;
import com.interview.copilot.dto.email.EmailConfiguration;
import com.interview.copilot.entity.email.StoredEmailConfiguration;
import com.interview.copilot.exception.email.EmailErrors;
import com.interview.copilot.mapper.email.EmailConfigurationMapper;
import com.interview.copilot.security.email.EmailConfigurationRules;
import com.interview.copilot.security.platform.PlatformSecretCipher;
import com.interview.copilot.service.audit.AuditService;
import com.interview.copilot.service.email.EmailConfigurationService;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EmailConfigurationServiceImpl implements EmailConfigurationService {
    private static final String SECRET_PURPOSE = "email-config:smtp-password";
    private final EmailConfigurationMapper mapper;
    private final PlatformSecretCipher cipher;
    private final AuditService audit;

    public EmailConfigurationServiceImpl(
            EmailConfigurationMapper mapper, PlatformSecretCipher cipher, AuditService audit) {
        this.mapper = mapper;
        this.cipher = cipher;
        this.audit = audit;
    }

    public EmailConfiguration get() {
        return view(row());
    }

    @Transactional
    public EmailConfiguration publish(long actorId, EmailConfiguration input) {
        Prepared prepared = draft(input);
        String secret = prepared.smtp().password();
        String encrypted = secret.isEmpty() ? "" : cipher.encrypt(SECRET_PURPOSE, secret);
        if (mapper.publish(prepared.view(), encrypted) != 1)
            throw EmailConfigurationRules.conflict();
        audit.record(actorId, "email.config.publish", "version:" + (prepared.view().version() + 1));
        return view(mapper.read());
    }

    public Prepared draft(EmailConfiguration input) {
        EmailConfiguration config = EmailConfigurationRules.normalize(input);
        StoredEmailConfiguration previous = row();
        if (config.version() != previous.version()) throw EmailConfigurationRules.conflict();
        String password = password(config, previous);
        SmtpProperties smtp = smtp(config, password);
        if (config.enabled()) EmailConfigurationRules.complete(smtp);
        return new Prepared(config, smtp);
    }

    public Prepared snapshot() {
        StoredEmailConfiguration stored = row();
        EmailConfiguration config = view(stored);
        String password =
                stored.enabled() ? cipher.decrypt(SECRET_PURPOSE, stored.encryptedPassword()) : "";
        return new Prepared(config, smtp(config, password));
    }

    private String password(EmailConfiguration config, StoredEmailConfiguration previous) {
        String entered = config.password() == null ? "" : config.password();
        if (config.username().isBlank()) {
            if (!entered.isEmpty()) throw EmailConfigurationRules.invalid();
            return "";
        }
        if (!entered.isEmpty()) return entered;
        if (!previous.encryptedPassword().isEmpty()
                && EmailConfigurationRules.changed(config, previous)) {
            throw new com.interview.copilot.exception.ApiException(
                    org.springframework.http.HttpStatus.BAD_REQUEST,
                    "email_password_required",
                    "修改邮件服务器、端口或认证账号后，请重新填写密码。");
        }
        return cipher.decrypt(SECRET_PURPOSE, previous.encryptedPassword());
    }

    private SmtpProperties smtp(EmailConfiguration config, String password) {
        return new SmtpProperties(
                config.host(),
                config.port(),
                config.username(),
                password,
                config.from(),
                config.startTls(),
                config.ssl(),
                5000);
    }

    private EmailConfiguration view(StoredEmailConfiguration stored) {
        return new EmailConfiguration(
                stored.version(),
                stored.enabled(),
                stored.host(),
                stored.port(),
                stored.username(),
                !stored.encryptedPassword().isEmpty(),
                null,
                stored.fromAddress(),
                stored.startTls(),
                stored.ssl());
    }

    private StoredEmailConfiguration row() {
        StoredEmailConfiguration row = mapper.read();
        if (row == null) throw EmailErrors.unavailable();
        return row;
    }
}
