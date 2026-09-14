package com.interview.copilot.service.impl.payment;

import com.interview.copilot.dto.payment.PaymentHeadersDTO;
import com.interview.copilot.dto.payment.PaymentOrderDTO;
import com.interview.copilot.dto.payment.PaymentResultDTO;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.exception.payment.PaymentErrors;
import com.interview.copilot.service.payment.AlipayConfigService;
import com.interview.copilot.service.payment.AlipayPaymentService;
import com.interview.copilot.service.payment.PaymentConfigService;
import com.interview.copilot.service.payment.PaymentProviderService;
import com.interview.copilot.service.payment.WechatPaymentService;
import com.interview.copilot.service.payment.ZpayChannelService;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class PaymentProviderServiceImpl implements PaymentProviderService {
    private final PaymentConfigService wechatConfigs;
    private final AlipayConfigService alipayConfigs;
    private final WechatPaymentService wechat;
    private final AlipayPaymentService alipay;
    private final ZpayChannelService zpay;

    public PaymentProviderServiceImpl(
            PaymentConfigService wechatConfigs,
            AlipayConfigService alipayConfigs,
            WechatPaymentService wechat,
            AlipayPaymentService alipay,
            ZpayChannelService zpay) {
        this.wechatConfigs = wechatConfigs;
        this.alipayConfigs = alipayConfigs;
        this.wechat = wechat;
        this.alipay = alipay;
        this.zpay = zpay;
    }

    public PaymentResultDTO wechatNotification(String body, PaymentHeadersDTO headers) {
        for (var c : wechatConfigs.notificationConfigs(headers.serial())) {
            try {
                return wechat.notification(c, body, headers);
            } catch (ApiException e) {
                if (!"PAYMENT_INVALID".equals(e.code())) throw e;
            }
        }
        throw PaymentErrors.invalid("支付通知验签或解密失败");
    }

    public List<String> availableMethods() {
        var methods = new ArrayList<String>();
        if (wechatConfigs.available()) methods.add("wechat");
        if (alipayConfigs.available()) methods.add("alipay");
        if (zpay.available()) methods.add("zpay");
        return List.copyOf(methods);
    }

    public long activeVersion(String method) {
        if ("zpay".equals(method)) return zpay.activeVersion();
        checkMethod(method);
        if ("alipay".equals(method)) {
            var c = alipayConfigs.read();
            if (!c.enabled() || !c.configured()) throw PaymentErrors.unavailable();
            return c.version();
        }
        var c = wechatConfigs.read();
        if (!c.enabled() || !c.configured()) throw PaymentErrors.unavailable();
        return c.version();
    }

    public PaymentResultDTO query(String method, long version, PaymentOrderDTO order) {
        if ("zpay".equals(method)) return zpay.query(version, order);
        checkMethod(method);
        return "alipay".equals(method)
                ? alipay.query(alipayConfigs.forOrder(version), order)
                : wechat.query(wechatConfigs.forOrder(version), order);
    }

    public String create(String method, long version, PaymentOrderDTO order) {
        if ("zpay".equals(method)) return zpay.create(version, order);
        checkMethod(method);
        return "alipay".equals(method)
                ? alipay.create(alipayConfigs.forOrder(version), order)
                : wechat.create(wechatConfigs.forOrder(version), order);
    }

    public void close(String method, long version, PaymentOrderDTO order) {
        if ("zpay".equals(method)) throw PaymentErrors.invalid("ZPAY 不支持渠道关单");
        checkMethod(method);
        if ("alipay".equals(method)) alipay.close(alipayConfigs.forOrder(version), order);
        else wechat.close(wechatConfigs.forOrder(version), order);
    }

    public void validateIdentity(String method, long version, PaymentResultDTO result) {
        if ("zpay".equals(method)) {
            zpay.validateIdentity(version, result);
            return;
        }
        checkMethod(method);
        String merchant;
        String app;
        if ("alipay".equals(method)) {
            var c = alipayConfigs.forOrder(version);
            merchant = c.sellerId();
            app = c.appId();
        } else {
            var c = wechatConfigs.forOrder(version);
            merchant = c.mchId();
            app = c.appId();
        }
        if (!method.equals(result.paymentMethod())
                || !merchant.equals(result.mchId())
                || !app.equals(result.appId())) throw PaymentErrors.invalid("支付结果与订单渠道或商户不匹配");
    }

    private void checkMethod(String method) {
        if (!"wechat".equals(method) && !"alipay".equals(method))
            throw PaymentErrors.invalid("请选择有效的支付方式");
    }
}
