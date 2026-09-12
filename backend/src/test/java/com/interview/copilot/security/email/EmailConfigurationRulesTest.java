package com.interview.copilot.security.email;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.interview.copilot.config.SmtpProperties;
import com.interview.copilot.dto.email.EmailConfiguration;
import com.interview.copilot.exception.ApiException;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

public class EmailConfigurationRulesTest {
    @ParameterizedTest
    @ValueSource(
            strings = {
                "https://smtp.example.com",
                "user:pass@smtp.example.com",
                "smtp.example.com/path",
                "smtp.example.com?other=1",
                "smtp.example.com\r\n",
                "smtp.example.com#fragment",
                "smtp.example.com:587"
            })
    void normalize_invalidHost_preventsUrlOrHeaderInjection(String host) {
        assertThatThrownBy(() -> EmailConfigurationRules.normalize(config(host, true, false)))
                .isInstanceOf(ApiException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"smtp.example.com", "127.0.0.1", "::1", "localhost"})
    void normalize_plainHostOrIp_acceptsExplicitAddress(String host) {
        assertThat(EmailConfigurationRules.normalize(config(host, true, false)).host())
                .isEqualTo(host);
    }

    @Test
    void complete_plainRemoteOrConflictingTls_rejectsUnsafeTransport() {
        assertThatThrownBy(
                        () ->
                                EmailConfigurationRules.complete(
                                        new SmtpProperties(
                                                "smtp.example.com",
                                                25,
                                                "",
                                                "",
                                                "mail@example.com",
                                                false,
                                                false,
                                                5000)))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(
                        () ->
                                EmailConfigurationRules.normalize(
                                        config("smtp.example.com", true, true)))
                .isInstanceOf(ApiException.class);
    }

    private EmailConfiguration config(String host, boolean startTls, boolean ssl) {
        return new EmailConfiguration(
                0,
                true,
                host,
                587,
                "user",
                false,
                "test-password",
                "from@example.com",
                startTls,
                ssl);
    }
}
