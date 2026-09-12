package com.interview.copilot.common.payment;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

final class AlipayTestSigner {
    private final KeyPair keys;

    AlipayTestSigner() {
        try {
            var generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            keys = generator.generateKeyPair();
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException(error);
        }
    }

    Map<String, Object> configuration(long version, boolean enabled) {
        var result = new LinkedHashMap<String, Object>();
        result.put("version", version);
        result.put("enabled", enabled);
        result.put("appId", "2026000000000001");
        result.put("sellerId", "2088000000000001");
        result.put("gatewayUrl", "https://openapi.alipay.com/gateway.do");
        result.put("notifyUrl", "http://pay.example.com/api/v1/payments/alipay/notify");
        result.put("appPrivateKey", Base64.getEncoder().encodeToString(keys.getPrivate().getEncoded()));
        result.put("alipayPublicKey", Base64.getEncoder().encodeToString(keys.getPublic().getEncoded()));
        return result;
    }

    Map<String, String> payment(String orderId, String status, String amount) {
        var fields = new LinkedHashMap<String, String>();
        fields.put("app_id", "2026000000000001");
        fields.put("seller_id", "2088000000000001");
        fields.put("out_trade_no", orderId);
        fields.put("trade_no", "alipay-fixture-" + orderId);
        fields.put("trade_status", status);
        fields.put("total_amount", amount);
        fields.put("gmt_payment", "2026-09-12 10:00:00");
        fields.put("notify_time", LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
        fields.put("notify_id", "notification-" + orderId);
        fields.put("notify_type", "trade_status_sync");
        fields.put("charset", "utf-8");
        fields.put("version", "1.0");
        fields.put("sign_type", "RSA2");
        return fields;
    }

    Map<String, String> sign(Map<String, String> fields) {
        var result = new LinkedHashMap<>(fields);
        var sorted = new TreeMap<>(result);
        sorted.remove("sign");
        sorted.remove("sign_type");
        String canonical = sorted.entrySet().stream().filter(item -> !item.getValue().isEmpty())
                .map(item -> item.getKey() + "=" + item.getValue()).collect(Collectors.joining("&"));
        try {
            Signature signature = Signature.getInstance("SHA256withRSA");
            signature.initSign(keys.getPrivate());
            signature.update(canonical.getBytes(StandardCharsets.UTF_8));
            result.put("sign", Base64.getEncoder().encodeToString(signature.sign()));
            return result;
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException(error);
        }
    }
}
