package com.interview.copilot.util;

import com.interview.copilot.exception.payment.PaymentErrors;
import org.springframework.util.DigestUtils;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description ZPAY 参数排序及 MD5 签名校验。
 */
public final class ZpaySignature {
    private ZpaySignature() {}

    public static String sign(Map<String, String> parameters, String key) {
        String content = new TreeMap<>(parameters).entrySet().stream()
                .filter(entry -> !"sign".equals(entry.getKey()) && !"sign_type".equals(entry.getKey()))
                .filter(entry -> entry.getValue() != null && !entry.getValue().isEmpty())
                .map(entry -> entry.getKey() + "=" + entry.getValue())
                .collect(Collectors.joining("&"));
        return DigestUtils.md5DigestAsHex((content + key).getBytes(StandardCharsets.UTF_8));
    }

    public static void verify(Map<String, String> parameters, String key) {
        String supplied = parameters.get("sign");
        if (!"MD5".equals(parameters.get("sign_type")) || supplied == null
                || !supplied.matches("[0-9a-f]{32}")) {
            throw PaymentErrors.invalid("ZPAY 通知签名格式错误");
        }
        if (!MessageDigest.isEqual(sign(parameters, key).getBytes(StandardCharsets.US_ASCII),
                supplied.getBytes(StandardCharsets.US_ASCII))) {
            throw PaymentErrors.invalid("ZPAY 通知验签失败");
        }
    }
}
