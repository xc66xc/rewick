package com.interview.copilot.common.email;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.interview.copilot.config.SmtpProperties;
import com.interview.copilot.exception.ApiException;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;

/**
 * @author Carl Wang
 * @date 2026-09-20
 * @description 验证品牌验证码邮件发送。
 */
public class SmtpTransportTest {
    @Test
    void send_configuredMail_composesCodeOnlyForTheRequestedRecipient() {
        JavaMailSenderImpl mail = mock(JavaMailSenderImpl.class);
        new SmtpTransport(config -> mail)
                .send(EmailTestData.smtp(), "alice@example.com", "582916", 600, "register");
        var message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mail).send(message.capture());
        assertThat(message.getValue().getTo()).containsExactly("alice@example.com");
        assertThat(message.getValue().getFrom()).isEqualTo("mail@example.com");
        assertThat(message.getValue().getText())
                .contains("582916", "10 分钟")
                .doesNotContain("test-password", EmailTestData.SECRET);
    }

    @Test
    void send_passwordReset_usesResetSubjectAndInstructions() {
        JavaMailSenderImpl mail = mock(JavaMailSenderImpl.class);
        new SmtpTransport(config -> mail)
                .send(EmailTestData.smtp(), "alice@example.com", "582916", 600, "password_reset");
        var message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mail).send(message.capture());
        assertThat(message.getValue().getSubject()).isEqualTo("掌灯 Rewick 重置密码验证码");
        assertThat(message.getValue().getText()).contains("重置密码", "582916").doesNotContain("注册");
    }

    @Test
    void send_transportError_returnsSafe503WithoutSmtpCredentialsOrCode() {
        JavaMailSenderImpl mail = mock(JavaMailSenderImpl.class);
        doThrow(new MailSendException("provider secret 582916 test-password"))
                .when(mail)
                .send(any(SimpleMailMessage.class));
        assertThatThrownBy(
                        () ->
                                new SmtpTransport(config -> mail)
                                        .send(
                                                EmailTestData.smtp(),
                                                "alice@example.com",
                                                "582916",
                                                600,
                                                "register"))
                .isInstanceOf(ApiException.class)
                .hasMessage("邮箱注册服务暂不可用，请稍后重试。");
    }

    @Test
    void testConnection_configuredDraft_onlyChecksConnectionWithoutSendingMail() throws Exception {
        JavaMailSenderImpl mail = mock(JavaMailSenderImpl.class);
        new SmtpTransport(config -> mail).testConnection(EmailTestData.smtp());
        verify(mail).testConnection();
        verify(mail, never()).send(any(SimpleMailMessage.class));
    }

    @Test
    void configure_tlsAndAnonymousTransport_applyBoundedSecureConnectionSettings() {
        var secure = SmtpTransport.configure(EmailTestData.smtp()).getJavaMailProperties();
        assertThat(secure.getProperty("mail.smtp.starttls.required")).isEqualTo("true");
        assertThat(secure.getProperty("mail.smtp.ssl.checkserveridentity")).isEqualTo("true");
        assertThat(secure.getProperty("mail.smtp.connectiontimeout")).isEqualTo("5000");
        var anonymous =
                SmtpTransport.configure(
                        new SmtpProperties(
                                "127.0.0.1", 2525, "", "", "mail@example.com", false, false, 5000));
        assertThat(anonymous.getUsername()).isNull();
        assertThat(anonymous.getJavaMailProperties().getProperty("mail.smtp.auth"))
                .isEqualTo("false");
    }
}
