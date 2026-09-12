package com.interview.copilot.common.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.dto.payment.PaymentConfigDTO;
import com.interview.copilot.dto.payment.PaymentHeadersDTO;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.service.impl.payment.WechatPaymentServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;

class WechatNotificationTest {
    private final WechatPaymentServiceImpl gateway = new WechatPaymentServiceImpl();
    private final ObjectMapper json = new ObjectMapper();
    private KeyPair keys;
    private PaymentConfigDTO config;

    @BeforeEach
    void keys() throws Exception {
        var generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        keys = generator.generateKeyPair();
        config = new PaymentConfigDTO(1, true, "1900000001", "wx1234567890123456",
                "A".repeat(40), "PUB_KEY_ID_0112345678901234567890123456789012",
                "https://pay.example.com/api/v1/payments/wechat/notify",
                pem("PRIVATE KEY", keys.getPrivate().getEncoded()), "12345678901234567890123456789012",
                pem("PUBLIC KEY", keys.getPublic().getEncoded()));
    }

    @Test
    void notification_signedEncryptedWechatPayload_decodesOrderTotalAndIdentity() throws Exception {
        String body = payload();

        var result = gateway.notification(config, body, headers(body));

        assertThat(result.orderId()).isEqualTo("fixture_order_01");
        assertThat(result.totalCents()).isEqualTo(1599);
        assertThat(result.mchId()).isEqualTo(config.mchId());
        assertThat(result.appId()).isEqualTo(config.appId());
        assertThat(result.currency()).isEqualTo("CNY");
        assertThat(result.state()).isEqualTo("SUCCESS");
    }

    @Test
    void notification_tamperedBody_rejectsSignature() throws Exception {
        String body = payload();
        var headers = headers(body);

        assertThatThrownBy(() -> gateway.notification(config, body + " ", headers)).isInstanceOf(ApiException.class);
    }

    @Test
    void notification_signedButWrongAeadKey_rejectsDecryption() throws Exception {
        String body = payload();
        var headers = headers(body);
        var wrong = new PaymentConfigDTO(1, true, config.mchId(), config.appId(), config.merchantSerial(),
                config.wechatPublicKeyId(), config.notifyUrl(), config.merchantPrivateKey(),
                "00000000000000000000000000000000", config.wechatPublicKey());

        assertThatThrownBy(() -> gateway.notification(wrong, body, headers)).isInstanceOf(ApiException.class);
    }

    private String payload() throws Exception {
        String plain = json.writeValueAsString(Map.of("appid", config.appId(), "mchid", config.mchId(),
                "out_trade_no", "fixture_order_01", "transaction_id", "42000000000000001",
                "trade_state", "SUCCESS", "trade_type", "NATIVE", "success_time", "2026-09-12T10:00:00+08:00",
                "amount", Map.of("total", 1599, "payer_total", 1499, "currency", "CNY", "payer_currency", "CNY")));
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        String nonce = "fixture12345";
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(config.apiV3Key().getBytes(StandardCharsets.UTF_8), "AES"),
                new GCMParameterSpec(128, nonce.getBytes(StandardCharsets.UTF_8)));
        cipher.updateAAD("transaction".getBytes(StandardCharsets.UTF_8));
        String encrypted = Base64.getEncoder().encodeToString(cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8)));
        return json.writeValueAsString(Map.of("id", "notification-fixture", "create_time", Instant.now().toString(),
                "event_type", "TRANSACTION.SUCCESS", "resource_type", "encrypt-resource",
                "resource", Map.of("algorithm", "AEAD_AES_256_GCM", "ciphertext", encrypted,
                        "associated_data", "transaction", "nonce", nonce, "original_type", "transaction")));
    }

    private PaymentHeadersDTO headers(String body) throws Exception {
        String timestamp = Long.toString(Instant.now().getEpochSecond());
        String nonce = "fixture_nonce";
        Signature signer = Signature.getInstance("SHA256withRSA");
        signer.initSign(keys.getPrivate());
        signer.update((timestamp + "\n" + nonce + "\n" + body + "\n").getBytes(StandardCharsets.UTF_8));
        return new PaymentHeadersDTO(config.wechatPublicKeyId(), nonce, timestamp,
                Base64.getEncoder().encodeToString(signer.sign()));
    }

    private String pem(String type, byte[] value) {
        return "-----BEGIN " + type + "-----\n" + Base64.getMimeEncoder(64, new byte[]{'\n'})
                .encodeToString(value) + "\n-----END " + type + "-----";
    }
}
