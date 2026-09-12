package com.interview.copilot.service.impl.payment;

import com.interview.copilot.dto.payment.PaymentConfigDTO;
import com.interview.copilot.entity.payment.PaymentConfigEntity;
import com.interview.copilot.exception.payment.PaymentErrors;
import com.interview.copilot.mapper.payment.PaymentConfigMapper;
import com.interview.copilot.response.payment.PaymentConfigResponse;
import com.interview.copilot.security.platform.PlatformSecretCipher;
import com.interview.copilot.service.audit.AuditService;
import com.interview.copilot.service.payment.PaymentConfigService;
import com.interview.copilot.service.payment.WechatPaymentService;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.util.List;

@Service
public class PaymentConfigServiceImpl implements PaymentConfigService {
    private final PaymentConfigMapper mapper;
    private final PlatformSecretCipher cipher;
    private final WechatPaymentService wechat;
    private final AuditService audit;

    public PaymentConfigServiceImpl(
            PaymentConfigMapper mapper,
            PlatformSecretCipher cipher,
            WechatPaymentService wechat,
            AuditService audit) {
        this.mapper = mapper;
        this.cipher = cipher;
        this.wechat = wechat;
        this.audit = audit;
    }

    public PaymentConfigResponse read() {
        return response(latest());
    }

    public boolean available() {
        var c = latest();
        return c.enabled() && configured(c);
    }

    public PaymentConfigDTO forOrder(long version) {
        var c = mapper.find(version);
        if (c == null) throw PaymentErrors.unavailable();
        return decrypt(c);
    }

    public List<PaymentConfigDTO> notificationConfigs(String serial) {
        return mapper.bySerial(serial).stream().map(this::decrypt).toList();
    }

    @Transactional
    public PaymentConfigResponse save(long actorId, PaymentConfigDTO p) {
        mapper.lock();
        var old = latest();
        if (old.id() != p.version())
            throw PaymentErrors.conflict("PAYMENT_CONFIG_CHANGED", "支付配置已变更，请重新加载");
        var next =
                new PaymentConfigEntity(
                        0,
                        p.enabled(),
                        text(p.mchId()),
                        text(p.appId()),
                        text(p.merchantSerial()),
                        text(p.wechatPublicKeyId()),
                        text(p.notifyUrl()),
                        secret("private", p.merchantPrivateKey(), old.merchantPrivateKey()),
                        secret("v3", p.apiV3Key(), old.apiV3Key()),
                        secret("public", p.wechatPublicKey(), old.wechatPublicKey()));
        if (next.enabled()) validateEnabled(next);
        mapper.insert(next);
        audit.record(actorId, "payment.config.save", Long.toString(mapper.latest().id()));
        return read();
    }

    private void validateEnabled(PaymentConfigEntity c) {
        if (!configured(c)) throw PaymentErrors.invalid("请完整填写微信支付商户信息和密钥后再启用");
        URI uri;
        try {
            uri = URI.create(c.notifyUrl());
        } catch (IllegalArgumentException e) {
            throw PaymentErrors.invalid("支付回调地址格式错误");
        }
        if (!("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))
                || uri.getHost() == null
                || uri.getUserInfo() != null
                || uri.getFragment() != null)
            throw PaymentErrors.invalid("支付回调地址必须为有效的 HTTP 或 HTTPS 地址");
        wechat.validate(decrypt(c));
    }

    private PaymentConfigEntity latest() {
        var c = mapper.latest();
        return c == null ? new PaymentConfigEntity(0, false, "", "", "", "", "", "", "", "") : c;
    }

    private boolean configured(PaymentConfigEntity c) {
        return !c.mchId().isBlank()
                && !c.appId().isBlank()
                && !c.merchantSerial().isBlank()
                && !c.wechatPublicKeyId().isBlank()
                && !c.notifyUrl().isBlank()
                && !c.merchantPrivateKey().isBlank()
                && !c.apiV3Key().isBlank()
                && !c.wechatPublicKey().isBlank();
    }

    private PaymentConfigResponse response(PaymentConfigEntity c) {
        return new PaymentConfigResponse(
                c.id(),
                c.enabled(),
                configured(c),
                c.mchId(),
                c.appId(),
                c.merchantSerial(),
                c.wechatPublicKeyId(),
                c.notifyUrl(),
                !c.merchantPrivateKey().isBlank(),
                !c.apiV3Key().isBlank(),
                !c.wechatPublicKey().isBlank());
    }

    private PaymentConfigDTO decrypt(PaymentConfigEntity c) {
        return new PaymentConfigDTO(
                c.id(),
                c.enabled(),
                c.mchId(),
                c.appId(),
                c.merchantSerial(),
                c.wechatPublicKeyId(),
                c.notifyUrl(),
                cipher.decrypt("wechat-private", c.merchantPrivateKey()),
                cipher.decrypt("wechat-v3", c.apiV3Key()),
                cipher.decrypt("wechat-public", c.wechatPublicKey()));
    }

    private String secret(String kind, String value, String previous) {
        return value == null || value.isBlank()
                ? previous
                : cipher.encrypt("wechat-" + kind, value.trim());
    }

    private String text(String value) {
        return value == null ? "" : value.trim();
    }
}
