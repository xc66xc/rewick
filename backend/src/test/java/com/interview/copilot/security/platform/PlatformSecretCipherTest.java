package com.interview.copilot.security.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.interview.copilot.common.platform.PlatformConfigFixture;
import com.interview.copilot.exception.ApiException;

import org.junit.jupiter.api.Test;

import java.util.Base64;

public class PlatformSecretCipherTest {
    private final PlatformSecretCipher cipher =
            new PlatformSecretCipher(PlatformConfigFixture.MASTER_KEY);

    @Test
    void encrypt_sameSecret_usesUniqueNoncesAndDecrypts() {
        String first = cipher.encrypt("provider-a", "fixture-provider-secret");
        String second = cipher.encrypt("provider-a", "fixture-provider-secret");

        assertThat(first).doesNotContain("fixture-provider-secret").isNotEqualTo(second);
        assertThat(cipher.decrypt("provider-a", first)).isEqualTo("fixture-provider-secret");
    }

    @Test
    void decrypt_wrongMasterKey_failsWithoutExposingSecret() {
        byte[] changed = new byte[32];
        changed[0] = 1;
        PlatformSecretCipher other =
                new PlatformSecretCipher(Base64.getEncoder().encodeToString(changed));
        String encrypted = cipher.encrypt("provider-a", "fixture-provider-secret");

        assertThatThrownBy(() -> other.decrypt("provider-a", encrypted))
                .isInstanceOf(ApiException.class)
                .hasMessageNotContaining("fixture-provider-secret")
                .extracting("code")
                .isEqualTo("PLATFORM_SECRET_UNAVAILABLE");
    }

    @Test
    void decrypt_ciphertextMovedToAnotherProvider_rejectsAadMismatch() {
        String encrypted = cipher.encrypt("provider-a", "fixture-provider-secret");

        assertThatThrownBy(() -> cipher.decrypt("provider-b", encrypted))
                .isInstanceOf(ApiException.class)
                .extracting("code")
                .isEqualTo("PLATFORM_SECRET_UNAVAILABLE");
    }

    @Test
    void decrypt_tamperedCiphertext_rejectsAuthenticationFailure() {
        String encrypted = cipher.encrypt("provider-a", "fixture-provider-secret");
        byte[] bytes = Base64.getDecoder().decode(encrypted.substring(3));
        bytes[bytes.length - 1] ^= 1;

        assertThatThrownBy(
                        () ->
                                cipher.decrypt(
                                        "provider-a",
                                        "v1:" + Base64.getEncoder().encodeToString(bytes)))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void encrypt_missingMasterKey_failsClosed() {
        assertThatThrownBy(
                        () ->
                                new PlatformSecretCipher("")
                                        .encrypt("provider-a", "fixture-provider-secret"))
                .isInstanceOf(ApiException.class)
                .extracting("code")
                .isEqualTo("PLATFORM_SECRET_UNAVAILABLE");
    }

    @Test
    void construct_invalidMasterKey_rejectsStartupWithoutEchoingInput() {
        assertThatThrownBy(() -> new PlatformSecretCipher("invalid-sensitive-value"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageNotContaining("invalid-sensitive-value");
    }
}
