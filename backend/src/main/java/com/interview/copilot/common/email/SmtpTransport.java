package com.interview.copilot.common.email;

import com.interview.copilot.config.SmtpProperties;
import com.interview.copilot.exception.email.EmailErrors;

import jakarta.mail.MessagingException;

import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Component;

import java.util.Properties;
import java.util.concurrent.Semaphore;
import java.util.function.Function;

@Component
public class SmtpTransport {
    private final Semaphore sending = new Semaphore(4);
    private final Function<SmtpProperties, JavaMailSenderImpl> factory;

    @Autowired
    public SmtpTransport() {
        this(SmtpTransport::configure);
    }

    SmtpTransport(Function<SmtpProperties, JavaMailSenderImpl> factory) {
        this.factory = factory;
    }

    public void send(
            SmtpProperties smtp, String email, String code, int expiresInSeconds, String purpose) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(smtp.from());
        message.setTo(email);
        String action = "password_reset".equals(purpose) ? "重置密码" : "注册";
        message.setSubject("Interview Copilot " + action + "验证码");
        message.setText(
                "你的"
                        + action
                        + "验证码是："
                        + code
                        + "\n有效期 "
                        + expiresInSeconds / 60
                        + " 分钟。请勿向他人提供验证码。如果不是你发起的"
                        + action
                        + "，请忽略此邮件。");
        if (!sending.tryAcquire()) throw EmailErrors.limited();
        try {
            factory.apply(smtp).send(message);
        } catch (MailException error) {
            LoggerFactory.getLogger(SmtpTransport.class)
                    .warn(
                            "Registration email delivery failed; exceptionType={}",
                            error.getClass().getSimpleName());
            throw EmailErrors.unavailable();
        } finally {
            sending.release();
        }
    }

    public void testConnection(SmtpProperties smtp) throws MessagingException {
        factory.apply(smtp).testConnection();
    }

    static JavaMailSenderImpl configure(SmtpProperties smtp) {
        JavaMailSenderImpl mail = new JavaMailSenderImpl();
        mail.setHost(smtp.host());
        mail.setPort(smtp.port());
        mail.setUsername(smtp.username().isEmpty() ? null : smtp.username());
        mail.setPassword(smtp.password().isEmpty() ? null : smtp.password());
        mail.setDefaultEncoding("UTF-8");
        Properties settings = mail.getJavaMailProperties();
        settings.setProperty("mail.smtp.auth", Boolean.toString(!smtp.username().isEmpty()));
        settings.setProperty("mail.smtp.starttls.enable", Boolean.toString(smtp.starttls()));
        settings.setProperty("mail.smtp.starttls.required", Boolean.toString(smtp.starttls()));
        settings.setProperty("mail.smtp.ssl.enable", Boolean.toString(smtp.ssl()));
        settings.setProperty("mail.smtp.ssl.checkserveridentity", "true");
        settings.setProperty("mail.debug", "false");
        for (String timeout : new String[] {"connectiontimeout", "timeout", "writetimeout"}) {
            settings.setProperty("mail.smtp." + timeout, Integer.toString(smtp.timeoutMillis()));
        }
        return mail;
    }
}
