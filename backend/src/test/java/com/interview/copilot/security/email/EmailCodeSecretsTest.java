package com.interview.copilot.security.email;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.interview.copilot.common.email.EmailTestData;
import com.interview.copilot.config.EmailAuthProperties;

import org.junit.jupiter.api.Test;

public class EmailCodeSecretsTest {
    @Test
    void generate_sameEmail_usesRandomNonceAndOnlyDigestCanBePersisted() {
        var secrets = new EmailCodeSecrets(EmailTestData.policy());
        var first = secrets.generate("alice@example.com");
        var second = secrets.generate("alice@example.com");

        assertThat(first.value()).matches("[0-9]{6}");
        assertThat(first.digest()).hasSize(64);
        assertThat(first.nonce()).hasSize(32).isNotEqualTo(second.nonce());
        assertThat(
                        secrets.matches(
                                "alice@example.com", first.nonce(), first.value(), first.digest()))
                .isTrue();
        assertThat(secrets.matches("bob@example.com", first.nonce(), first.value(), first.digest()))
                .isFalse();
        assertThat(
                        secrets.matches(
                                "alice@example.com", second.nonce(), first.value(), first.digest()))
                .isFalse();
        assertThat(first.toString()).doesNotContain(first.value(), first.digest());
    }

    @Test
    void configuration_missingSecret_disablesCodeGenerationWithoutFallbackKey() {
        var secrets =
                new EmailCodeSecrets(new EmailAuthProperties(true, "", 600, 60, 5, 5, 20, 30));
        assertThat(secrets.isConfigured()).isFalse();
        assertThatThrownBy(() -> secrets.generate("alice@example.com"))
                .hasMessage("邮箱注册服务暂不可用，请稍后重试。");
    }

    @Test
    void configuration_invalidSecret_failsWithoutEchoingValue() {
        assertThatThrownBy(
                        () ->
                                new EmailCodeSecrets(
                                        new EmailAuthProperties(
                                                true, "not-a-secret", 600, 60, 5, 5, 20, 30)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageNotContaining("not-a-secret");
    }
}
