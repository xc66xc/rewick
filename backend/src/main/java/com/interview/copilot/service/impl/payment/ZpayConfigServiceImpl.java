package com.interview.copilot.service.impl.payment;

import com.interview.copilot.dto.payment.ZpayConfigDTO;
import com.interview.copilot.entity.payment.ZpayConfigEntity;
import com.interview.copilot.exception.payment.PaymentErrors;
import com.interview.copilot.mapper.payment.ZpayConfigMapper;
import com.interview.copilot.response.payment.ZpayConfigResponse;
import com.interview.copilot.security.platform.PlatformSecretCipher;
import com.interview.copilot.service.audit.AuditService;
import com.interview.copilot.service.payment.ZpayConfigService;
import com.interview.copilot.validation.payment.ZpayConfigValidation;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description ZPAY 配置加密存储、版本锁与订单配置快照
 */
@Service
public class ZpayConfigServiceImpl implements ZpayConfigService {
    private static final String SECRET_KIND = "zpay-merchant";
    private final ZpayConfigMapper mapper;
    private final PlatformSecretCipher cipher;
    private final AuditService audit;

    public ZpayConfigServiceImpl(ZpayConfigMapper mapper, PlatformSecretCipher cipher, AuditService audit) {
        this.mapper = mapper;
        this.cipher = cipher;
        this.audit = audit;
    }

    public ZpayConfigResponse read() {
        return response(latest());
    }

    public boolean available() {
        var value = latest();
        return value.enabled() && ZpayConfigValidation.configured(value);
    }

    public ZpayConfigDTO forOrder(long version) {
        var value = mapper.find(version);
        if (value == null) throw PaymentErrors.unavailable();
        return new ZpayConfigDTO(value.id(), value.enabled(), value.pid(), value.paymentType(),
                value.gatewayUrl(), value.queryUrl(), value.notifyUrl(), value.returnUrl(),
                value.cid(), cipher.decrypt(SECRET_KIND, value.merchantKey()));
    }

    @Transactional
    public ZpayConfigResponse save(long actorId, ZpayConfigDTO input) {
        mapper.lock();
        var previous = latest();
        if (previous.id() != input.version()) {
            throw PaymentErrors.conflict("PAYMENT_CONFIG_CHANGED", "支付配置已变更，请重新加载");
        }
        var next = new ZpayConfigEntity(0, input.enabled(), text(input.pid()), text(input.paymentType()),
                text(input.gatewayUrl()), text(input.queryUrl()), text(input.notifyUrl()), text(input.returnUrl()),
                text(input.cid()), secret(input.merchantKey(), previous.merchantKey()));
        ZpayConfigValidation.validate(next);
        mapper.insert(next);
        var saved = read();
        audit.record(actorId, "payment.zpay.config.save", Long.toString(saved.version()));
        return saved;
    }

    private ZpayConfigEntity latest() {
        var value = mapper.latest();
        return value == null ? new ZpayConfigEntity(0, false, "", "alipay", "", "", "", "", "", "") : value;
    }

    private ZpayConfigResponse response(ZpayConfigEntity value) {
        return new ZpayConfigResponse(value.id(), value.enabled(), ZpayConfigValidation.configured(value),
                value.pid(), value.paymentType(), value.gatewayUrl(), value.queryUrl(), value.notifyUrl(),
                value.returnUrl(), value.cid(), !value.merchantKey().isBlank());
    }

    private String secret(String value, String previous) {
        return value == null || value.isBlank() ? previous : cipher.encrypt(SECRET_KIND, value.trim());
    }

    private String text(String value) {
        return value == null ? "" : value.trim();
    }
}
