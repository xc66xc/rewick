package com.interview.copilot.validation.payment;

import com.interview.copilot.entity.payment.ZpayConfigEntity;
import com.interview.copilot.exception.payment.PaymentErrors;
import java.net.URI;
import java.util.Set;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description ZPAY 配置完整性与支付地址校验
 */
public final class ZpayConfigValidation {
    private static final Set<String> HOSTS = Set.of("zpayz.cn", "z-pay.cn");
    private static final Set<String> PAYMENT_TYPES = Set.of("alipay", "wxpay");

    private ZpayConfigValidation() {}

    public static boolean configured(ZpayConfigEntity value) {
        return !value.pid().isBlank() && PAYMENT_TYPES.contains(value.paymentType())
                && !value.gatewayUrl().isBlank() && !value.queryUrl().isBlank()
                && !value.notifyUrl().isBlank() && !value.returnUrl().isBlank()
                && !value.merchantKey().isBlank();
    }

    public static void validate(ZpayConfigEntity value) {
        if (!PAYMENT_TYPES.contains(value.paymentType())) {
            throw PaymentErrors.invalid("ZPAY 支付类型只能是 alipay 或 wxpay");
        }
        validateEndpoint(value.gatewayUrl(), "/mapi.php");
        validateEndpoint(value.queryUrl(), "/api.php");
        if (!value.notifyUrl().isBlank()) secureUri(value.notifyUrl());
        if (!value.returnUrl().isBlank()) secureUri(value.returnUrl());
        if (value.enabled() && !configured(value)) {
            throw PaymentErrors.invalid("请完整填写 ZPAY 商户信息、地址和密钥后再启用");
        }
    }

    private static void validateEndpoint(String value, String path) {
        if (value.isBlank()) return;
        URI uri = secureUri(value);
        if (!HOSTS.contains(uri.getHost()) || !path.equals(uri.getRawPath())) {
            throw PaymentErrors.invalid("ZPAY 接口须使用 zpayz.cn 或 z-pay.cn，完整路径为 " + path);
        }
    }

    private static URI secureUri(String value) {
        URI uri;
        try {
            uri = URI.create(value);
        } catch (IllegalArgumentException error) {
            throw PaymentErrors.invalid("ZPAY 地址格式错误");
        }
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null) {
            throw PaymentErrors.invalid("ZPAY 地址必须为有效的 HTTPS 地址，不允许包含账号信息");
        }
        if (uri.getQuery() != null || uri.getFragment() != null || (uri.getPort() != -1 && uri.getPort() != 443)) {
            throw PaymentErrors.invalid("ZPAY 地址不能包含查询参数、片段或非 HTTPS 标准端口");
        }
        return uri;
    }
}
