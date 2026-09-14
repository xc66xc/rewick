package com.interview.copilot.service.impl.payment;

import com.interview.copilot.dto.payment.AlipayConfigDTO;
import com.interview.copilot.entity.payment.AlipayConfigEntity;
import com.interview.copilot.exception.payment.PaymentErrors;
import com.interview.copilot.mapper.payment.AlipayConfigMapper;
import com.interview.copilot.response.payment.AlipayConfigResponse;
import com.interview.copilot.security.platform.PlatformSecretCipher;
import com.interview.copilot.service.audit.AuditService;
import com.interview.copilot.service.payment.AlipayConfigService;
import com.interview.copilot.service.payment.AlipayPaymentService;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;

@Service
public class AlipayConfigServiceImpl implements AlipayConfigService {
    private final AlipayConfigMapper mapper;
    private final PlatformSecretCipher cipher;
    private final AlipayPaymentService alipay;
    private final AuditService audit;

    public AlipayConfigServiceImpl(
            AlipayConfigMapper mapper,
            PlatformSecretCipher cipher,
            AlipayPaymentService alipay,
            AuditService audit) {
        this.mapper = mapper;
        this.cipher = cipher;
        this.alipay = alipay;
        this.audit = audit;
    }

    public AlipayConfigResponse read() {
        return response(latest());
    }

    public boolean available() {
        var c = latest();
        return c.enabled() && configured(c);
    }

    public AlipayConfigDTO forOrder(long version) {
        var c = mapper.find(version);
        if (c == null) throw PaymentErrors.unavailable();
        return decrypt(c);
    }

    @Transactional
    public AlipayConfigResponse save(long actorId, AlipayConfigDTO p) {
        mapper.lock();
        var old = latest();
        if (old.id() != p.version())
            throw PaymentErrors.conflict("PAYMENT_CONFIG_CHANGED", "支付配置已变更，请重新加载");
        var next =
                new AlipayConfigEntity(
                        0,
                        p.enabled(),
                        text(p.appId()),
                        text(p.sellerId()),
                        text(p.gatewayUrl()),
                        text(p.notifyUrl()),
                        text(p.returnUrl()),
                        secret("alipay-private", p.appPrivateKey(), old.appPrivateKey()),
                        secret("alipay-public", p.alipayPublicKey(), old.alipayPublicKey()));
        if (next.enabled()) validateEnabled(next);
        mapper.insert(next);
        audit.record(actorId, "payment.alipay.config.save", Long.toString(mapper.latest().id()));
        return read();
    }

    private void validateEnabled(AlipayConfigEntity c) {
        if (!configured(c)) throw PaymentErrors.invalid("请完整填写支付宝应用信息和密钥后再启用");
        URI uri;
        try {
            uri = URI.create(c.notifyUrl());
            URI returned = URI.create(c.returnUrl());
            if (!"https".equalsIgnoreCase(returned.getScheme())
                    || returned.getHost() == null
                    || returned.getUserInfo() != null
                    || returned.getFragment() != null)
                throw PaymentErrors.invalid("支付返回地址必须为有效的 HTTPS 地址");
        } catch (IllegalArgumentException e) {
            throw PaymentErrors.invalid("支付回调地址格式错误");
        }
        if (!"https".equalsIgnoreCase(uri.getScheme())
                || uri.getHost() == null
                || uri.getUserInfo() != null
                || uri.getFragment() != null) throw PaymentErrors.invalid("支付回调地址必须为有效的 HTTPS 地址");
        alipay.validate(decrypt(c));
    }

    private AlipayConfigEntity latest() {
        var c = mapper.latest();
        return c == null ? new AlipayConfigEntity(0, false, "", "", "", "", "", "", "") : c;
    }

    private boolean configured(AlipayConfigEntity c) {
        return !c.appId().isBlank()
                && !c.sellerId().isBlank()
                && !c.gatewayUrl().isBlank()
                && !c.notifyUrl().isBlank()
                && !c.returnUrl().isBlank()
                && !c.appPrivateKey().isBlank()
                && !c.alipayPublicKey().isBlank();
    }

    private AlipayConfigResponse response(AlipayConfigEntity c) {
        return new AlipayConfigResponse(
                c.id(),
                c.enabled(),
                configured(c),
                c.appId(),
                c.sellerId(),
                c.gatewayUrl(),
                c.notifyUrl(),
                c.returnUrl(),
                !c.appPrivateKey().isBlank(),
                !c.alipayPublicKey().isBlank());
    }

    private AlipayConfigDTO decrypt(AlipayConfigEntity c) {
        return new AlipayConfigDTO(
                c.id(),
                c.enabled(),
                c.appId(),
                c.sellerId(),
                c.gatewayUrl(),
                c.notifyUrl(),
                c.returnUrl(),
                cipher.decrypt("alipay-private", c.appPrivateKey()),
                cipher.decrypt("alipay-public", c.alipayPublicKey()));
    }

    private String secret(String kind, String value, String previous) {
        return value == null || value.isBlank() ? previous : cipher.encrypt(kind, value.trim());
    }

    private String text(String value) {
        return value == null ? "" : value.trim();
    }
}
