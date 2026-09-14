package com.interview.copilot.validation.payment;

import com.interview.copilot.dto.payment.ZpayConfigDTO;
import com.interview.copilot.exception.payment.PaymentErrors;
import com.interview.copilot.util.ServerTime;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;
import java.time.format.DateTimeParseException;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 校验 ZPAY 商户身份、金额和北京时间。
 */
public final class ZpayResultValidation {
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss")
            .withResolverStyle(ResolverStyle.STRICT);
    private ZpayResultValidation() {}

    public static void identity(ZpayConfigDTO config, String pid, String type) {
        if (!config.pid().equals(pid) || !config.paymentType().equals(type)) {
            throw PaymentErrors.invalid("ZPAY 商户或支付类型不匹配");
        }
    }

    public static String identifier(String value) {
        if (value == null || !value.matches("[0-9A-Za-z_-]{1,64}")) {
            throw PaymentErrors.invalid("ZPAY 交易编号格式错误");
        }
        return value;
    }

    public static int cents(String value) {
        if (value == null || !value.matches("[0-9]{1,10}(\\.[0-9]{1,2})?")) {
            throw PaymentErrors.invalid("ZPAY 金额格式错误");
        }
        try {
            int result = new BigDecimal(value).movePointRight(2).intValueExact();
            if (result <= 0) throw PaymentErrors.invalid("ZPAY 金额必须大于零");
            return result;
        } catch (ArithmeticException error) {
            throw PaymentErrors.invalid("ZPAY 金额超出范围");
        }
    }

    public static Instant paidAt(String value) {
        try {
            return ServerTime.instant(LocalDateTime.parse(value, TIME));
        } catch (DateTimeParseException | NullPointerException error) {
            throw PaymentErrors.invalid("ZPAY 付款时间格式错误");
        }
    }
}
