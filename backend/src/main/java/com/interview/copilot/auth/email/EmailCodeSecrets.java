package com.interview.copilot.auth.email;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

@Component
public class EmailCodeSecrets {
    private final SecureRandom random = new SecureRandom();
    private final byte[] key;

    public EmailCodeSecrets(EmailAuthProperties properties) {
        String configured = properties.codeSecret();
        if (configured == null || configured.isBlank()) { key = new byte[0]; return; }
        try { key = Base64.getDecoder().decode(configured); }
        catch (IllegalArgumentException error) { throw new IllegalStateException("Email code secret must be Base64-encoded 32 bytes."); }
        if (key.length != 32) throw new IllegalStateException("Email code secret must be Base64-encoded 32 bytes.");
    }

    public boolean isConfigured() { return key.length == 32; }

    public Code generate(String email) {
        String value = String.format(Locale.ROOT, "%06d", random.nextInt(1000000));
        byte[] bytes = new byte[16];
        random.nextBytes(bytes);
        String nonce = HexFormat.of().formatHex(bytes);
        return new Code(value, nonce, digest(email, nonce, value));
    }

    public boolean matches(String email, String nonce, String code, String expected) {
        return MessageDigest.isEqual(digest(email, nonce, code).getBytes(StandardCharsets.US_ASCII),
                expected.getBytes(StandardCharsets.US_ASCII));
    }

    private String digest(String email, String nonce, String code) {
        if (!isConfigured()) throw EmailErrors.unavailable();
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal((email + "\n" + nonce + "\n" + code).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException error) { throw new IllegalStateException("Email code cryptography unavailable."); }
    }

    public record Code(String value, String nonce, String digest) {
        @Override public String toString() { return "Code[redacted]"; }
    }
}
