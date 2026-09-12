package com.interview.copilot.service.impl.payment;

import com.interview.copilot.dto.payment.PaymentConfigDTO;
import com.interview.copilot.dto.payment.PaymentHeadersDTO;
import com.interview.copilot.dto.payment.PaymentOrderDTO;
import com.interview.copilot.dto.payment.PaymentResultDTO;
import com.interview.copilot.exception.payment.PaymentErrors;
import com.interview.copilot.service.payment.WechatPaymentService;
import com.wechat.pay.java.core.RSAPublicKeyConfig;
import com.wechat.pay.java.core.exception.ServiceException;
import com.wechat.pay.java.core.exception.WechatPayException;
import com.wechat.pay.java.core.http.DefaultHttpClientBuilder;
import com.wechat.pay.java.core.notification.NotificationParser;
import com.wechat.pay.java.core.notification.RequestParam;
import com.wechat.pay.java.service.payments.model.Transaction;
import com.wechat.pay.java.service.payments.nativepay.NativePayService;
import com.wechat.pay.java.service.payments.nativepay.model.Amount;
import com.wechat.pay.java.service.payments.nativepay.model.CloseOrderRequest;
import com.wechat.pay.java.service.payments.nativepay.model.PrepayRequest;
import com.wechat.pay.java.service.payments.nativepay.model.QueryOrderByOutTradeNoRequest;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Instant;

@Service
public class WechatPaymentServiceImpl implements WechatPaymentService {
    private static final Logger LOG = LoggerFactory.getLogger(WechatPaymentServiceImpl.class);

    public void validate(PaymentConfigDTO c) {
        if (c.apiV3Key().getBytes(StandardCharsets.UTF_8).length != 32)
            throw PaymentErrors.invalid("API v3 密钥必须为 32 字节");
        try {
            config(c);
        } catch (IllegalArgumentException | WechatPayException e) {
            throw PaymentErrors.invalid("微信支付密钥格式错误，请检查 PEM 私钥、公钥和公钥 ID");
        }
    }

    public String create(PaymentConfigDTO c, PaymentOrderDTO o) {
        var request = new PrepayRequest();
        request.setAppid(c.appId());
        request.setMchid(c.mchId());
        request.setDescription(o.packageName());
        request.setOutTradeNo(o.id());
        request.setTimeExpire(o.expiresAt().toString());
        request.setNotifyUrl(c.notifyUrl());
        var amount = new Amount();
        amount.setTotal(o.totalCents());
        amount.setCurrency("CNY");
        request.setAmount(amount);
        try {
            return client(c).prepay(request).getCodeUrl();
        } catch (WechatPayException e) {
            throw upstream(o.id(), e);
        }
    }

    public PaymentResultDTO query(PaymentConfigDTO c, PaymentOrderDTO o) {
        var request = new QueryOrderByOutTradeNoRequest();
        request.setMchid(c.mchId());
        request.setOutTradeNo(o.id());
        try {
            return result(client(c).queryOrderByOutTradeNo(request));
        } catch (ServiceException e) {
            if ("ORDER_NOT_EXIST".equals(e.getErrorCode()))
                return new PaymentResultDTO(
                        o.id(), c.mchId(), c.appId(), null, "NOTFOUND", null, 0, null);
            throw upstream(o.id(), e);
        } catch (WechatPayException e) {
            throw upstream(o.id(), e);
        }
    }

    public void close(PaymentConfigDTO c, PaymentOrderDTO o) {
        var request = new CloseOrderRequest();
        request.setMchid(c.mchId());
        request.setOutTradeNo(o.id());
        try {
            client(c).closeOrder(request);
        } catch (WechatPayException e) {
            throw upstream(o.id(), e);
        }
    }

    public PaymentResultDTO notification(PaymentConfigDTO c, String body, PaymentHeadersDTO h) {
        var request =
                new RequestParam.Builder()
                        .serialNumber(h.serial())
                        .timestamp(h.timestamp())
                        .nonce(h.nonce())
                        .signature(h.signature())
                        .body(body)
                        .build();
        try {
            return result(new NotificationParser(config(c)).parse(request, Transaction.class));
        } catch (WechatPayException | IllegalArgumentException e) {
            throw PaymentErrors.invalid("支付通知验签或解密失败");
        }
    }

    private RSAPublicKeyConfig config(PaymentConfigDTO c) {
        return new RSAPublicKeyConfig.Builder()
                .merchantId(c.mchId())
                .privateKey(c.merchantPrivateKey())
                .merchantSerialNumber(c.merchantSerial())
                .apiV3Key(c.apiV3Key())
                .publicKey(c.wechatPublicKey())
                .publicKeyId(c.wechatPublicKeyId())
                .build();
    }

    private NativePayService client(PaymentConfigDTO c) {
        var http =
                new DefaultHttpClientBuilder()
                        .config(config(c))
                        .connectTimeoutMs(5000)
                        .readTimeoutMs(8000)
                        .writeTimeoutMs(8000)
                        .disableRetryOnConnectionFailure()
                        .build();
        return new NativePayService.Builder().httpClient(http).build();
    }

    private PaymentResultDTO result(Transaction t) {
        var amount = t.getAmount();
        return new PaymentResultDTO(
                t.getOutTradeNo(),
                t.getMchid(),
                t.getAppid(),
                t.getTransactionId(),
                t.getTradeState() == null ? "UNKNOWN" : t.getTradeState().name(),
                amount == null ? null : amount.getCurrency(),
                amount == null || amount.getTotal() == null ? 0 : amount.getTotal(),
                t.getSuccessTime() == null ? null : Instant.parse(t.getSuccessTime()));
    }

    private RuntimeException upstream(String orderId, WechatPayException e) {
        if (e instanceof ServiceException service)
            LOG.warn(
                    "Wechat request failed for order {}, status {}, code {}",
                    orderId,
                    service.getHttpStatusCode(),
                    service.getErrorCode());
        else
            LOG.warn(
                    "Wechat request failed for order {}, type {}",
                    orderId,
                    e.getClass().getSimpleName());
        return PaymentErrors.upstream();
    }
}
