package com.interview.copilot.converter.payment;

import com.interview.copilot.exception.payment.PaymentErrors;

import java.io.IOException;
import java.io.InputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class AlipayFormConverter {
    private AlipayFormConverter() {}

    public static Map<String, List<String>> parameters(InputStream input) throws IOException {
        byte[] bytes = input.readNBytes(65537);
        if (bytes.length > 65536) throw PaymentErrors.invalid("支付通知过大");
        var result = new LinkedHashMap<String, List<String>>();
        String body = new String(bytes, StandardCharsets.UTF_8);
        for (String field : body.split("&", -1)) {
            int separator = field.indexOf('=');
            if (separator <= 0) throw PaymentErrors.invalid("支付通知表单格式错误");
            String key = URLDecoder.decode(field.substring(0, separator), StandardCharsets.UTF_8);
            String value =
                    URLDecoder.decode(field.substring(separator + 1), StandardCharsets.UTF_8);
            result.computeIfAbsent(key, ignored -> new ArrayList<>()).add(value);
        }
        return result;
    }
}
