package com.interview.copilot.platform;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public final class PlatformSecretCipher {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final SecretKeySpec key;

    public PlatformSecretCipher(@Value("${copilot.platform.master-key:}") String masterKey) {
        key = parse(masterKey);
    }

    private SecretKeySpec parse(String value) {
        if (value == null || value.isBlank()) { return null; }
        try {
            byte[] decoded = Base64.getDecoder().decode(value);
            if (decoded.length != 32) { throw new IllegalArgumentException("Invalid key length"); }
            return new SecretKeySpec(decoded, "AES");
        } catch (IllegalArgumentException error) {
            throw new IllegalStateException("Platform master key must be Base64 encoded 32 bytes");
        }
    }

    public String encrypt(String providerId, String plaintext) {
        requireKey();
        byte[] nonce = new byte[12];
        RANDOM.nextBytes(nonce);
        try {
            Cipher cipher = cipher(Cipher.ENCRYPT_MODE, nonce, providerId);
            byte[] encrypted = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            return "v1:" + Base64.getEncoder().encodeToString(ByteBuffer.allocate(nonce.length + encrypted.length)
                    .put(nonce).put(encrypted).array());
        } catch (GeneralSecurityException error) { throw PlatformConfigErrors.secretUnavailable(); }
    }

    public String decrypt(String providerId, String encrypted) {
        if (encrypted.isEmpty()) { return ""; }
        requireKey();
        try {
            if (!encrypted.startsWith("v1:")) { throw PlatformConfigErrors.secretUnavailable(); }
            byte[] bytes = Base64.getDecoder().decode(encrypted.substring(3));
            if (bytes.length < 28) { throw PlatformConfigErrors.secretUnavailable(); }
            ByteBuffer input = ByteBuffer.wrap(bytes);
            byte[] nonce = new byte[12];
            input.get(nonce);
            byte[] ciphertext = new byte[input.remaining()];
            input.get(ciphertext);
            return new String(cipher(Cipher.DECRYPT_MODE, nonce, providerId).doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException error) {
            throw PlatformConfigErrors.secretUnavailable();
        }
    }

    private Cipher cipher(int mode, byte[] nonce, String providerId) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(mode, key, new GCMParameterSpec(128, nonce));
        cipher.updateAAD(providerId.getBytes(StandardCharsets.UTF_8));
        return cipher;
    }

    private void requireKey() { if (key == null) { throw PlatformConfigErrors.secretUnavailable(); } }
}
