package com.interview.copilot.service.impl.payment;

import com.alipay.api.AlipayApiException;
import com.alipay.api.AlipayConfig;
import com.alipay.api.AlipayResponse;
import com.alipay.api.DefaultAlipayClient;
import com.alipay.api.domain.AlipayTradeCloseModel;
import com.alipay.api.domain.AlipayTradePrecreateModel;
import com.alipay.api.domain.AlipayTradeQueryModel;
import com.alipay.api.internal.util.AlipaySignature;
import com.alipay.api.request.AlipayTradeCloseRequest;
import com.alipay.api.request.AlipayTradePrecreateRequest;
import com.alipay.api.request.AlipayTradeQueryRequest;
import com.alipay.api.response.AlipayTradeQueryResponse;
import com.interview.copilot.dto.payment.AlipayConfigDTO;
import com.interview.copilot.dto.payment.PaymentOrderDTO;
import com.interview.copilot.dto.payment.PaymentResultDTO;
import com.interview.copilot.exception.payment.PaymentErrors;
import com.interview.copilot.service.payment.AlipayPaymentService;
import com.interview.copilot.util.ServerTime;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.io.IOException;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.interfaces.RSAKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

@Service
public class AlipayPaymentServiceImpl implements AlipayPaymentService {
    private static final Logger LOG = LoggerFactory.getLogger(AlipayPaymentServiceImpl.class);
    private static final DateTimeFormatter TIME =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final Set<String> GATEWAYS =
            Set.of(
                    "https://openapi.alipay.com/gateway.do",
                    "https://openapi-sandbox.dl.alipaydev.com/gateway.do");

    public void validate(AlipayConfigDTO c) {
        if (!GATEWAYS.contains(c.gatewayUrl())) throw PaymentErrors.invalid("请填写支付宝生产或沙箱的完整官方网关地址");
        if (!c.appId().matches("[0-9]{10,32}") || !c.sellerId().matches("[0-9]{10,32}"))
            throw PaymentErrors.invalid("支付宝 AppID 和卖家 ID 必须为平台提供的数字编号");
        try {
            var factory = KeyFactory.getInstance("RSA");
            var privateKey =
                    (RSAKey)
                            factory.generatePrivate(
                                    new PKCS8EncodedKeySpec(
                                            Base64.getDecoder().decode(key(c.appPrivateKey()))));
            var publicKey =
                    (RSAKey)
                            factory.generatePublic(
                                    new X509EncodedKeySpec(
                                            Base64.getDecoder().decode(key(c.alipayPublicKey()))));
            if (privateKey.getModulus().bitLength() < 2048
                    || publicKey.getModulus().bitLength() < 2048)
                throw PaymentErrors.invalid("支付宝 RSA2 密钥长度至少为 2048 位");
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw PaymentErrors.invalid("支付宝密钥格式错误，请填写 PKCS8 应用私钥和支付宝公钥");
        }
    }

    public String create(AlipayConfigDTO c, PaymentOrderDTO o) {
        var model = new AlipayTradePrecreateModel();
        model.setOutTradeNo(o.id());
        model.setSubject(o.packageName());
        model.setSellerId(c.sellerId());
        model.setTotalAmount(BigDecimal.valueOf(o.totalCents(), 2).toPlainString());
        model.setTimeExpire(TIME.format(ServerTime.local(o.expiresAt())));
        var request = new AlipayTradePrecreateRequest();
        request.setBizModel(model);
        request.setNotifyUrl(c.notifyUrl());
        try {
            var response = client(c).execute(request);
            requireSuccess(response, o.id());
            if (!o.id().equals(response.getOutTradeNo())
                    || response.getQrCode() == null
                    || response.getQrCode().isBlank()) throw PaymentErrors.upstream();
            return response.getQrCode();
        } catch (AlipayApiException e) {
            throw upstream(o.id(), e);
        }
    }

    public PaymentResultDTO query(AlipayConfigDTO c, PaymentOrderDTO o) {
        var model = new AlipayTradeQueryModel();
        model.setOutTradeNo(o.id());
        var request = new AlipayTradeQueryRequest();
        request.setBizModel(model);
        try {
            var response = executeQuery(client(c), request);
            if ("ACQ.TRADE_NOT_EXIST".equals(response.getSubCode()))
                return result(c, o.id(), null, "NOTFOUND", 0, null);
            requireSuccess(response, o.id());
            String currency = response.getTransCurrency();
            if (currency != null && !currency.isBlank() && !"CNY".equals(currency))
                throw PaymentErrors.invalid("支付宝交易币种不匹配");
            return result(
                    c,
                    response.getOutTradeNo(),
                    response.getTradeNo(),
                    state(response.getTradeStatus()),
                    cents(response.getTotalAmount()),
                    response.getSendPayDate() == null
                            ? null
                            : response.getSendPayDate().toInstant());
        } catch (AlipayApiException e) {
            throw upstream(o.id(), e);
        }
    }

    public void close(AlipayConfigDTO c, PaymentOrderDTO o) {
        var model = new AlipayTradeCloseModel();
        model.setOutTradeNo(o.id());
        var request = new AlipayTradeCloseRequest();
        request.setBizModel(model);
        try {
            var response = client(c).execute(request);
            if ("ACQ.TRADE_NOT_EXIST".equals(response.getSubCode())) return;
            requireSuccess(response, o.id());
            if (!o.id().equals(response.getOutTradeNo()))
                throw PaymentErrors.invalid("支付宝关单响应与订单不匹配");
        } catch (AlipayApiException e) {
            throw upstream(o.id(), e);
        }
    }

    private AlipayTradeQueryResponse executeQuery(
            DefaultAlipayClient client, AlipayTradeQueryRequest request) throws AlipayApiException {
        for (int attempt = 0; ; attempt++) {
            try {
                return client.execute(request);
            } catch (AlipayApiException error) {
                Throwable cause = rootCause(error);
                if (attempt >= 2 || !(cause instanceof IOException)
                        || cause instanceof javax.net.ssl.SSLException) throw error;
            }
        }
    }

    public PaymentResultDTO notification(AlipayConfigDTO c, Map<String, String> p) {
        if (!"RSA2".equals(p.get("sign_type")) || !"utf-8".equalsIgnoreCase(p.get("charset")))
            throw PaymentErrors.invalid("支付宝通知签名类型或编码错误");
        try {
            if (!AlipaySignature.rsaCheckV1(
                    new HashMap<>(p), key(c.alipayPublicKey()), "UTF-8", "RSA2"))
                throw PaymentErrors.invalid("支付宝通知验签失败");
        } catch (AlipayApiException | IllegalArgumentException e) {
            throw PaymentErrors.invalid("支付宝通知验签失败");
        }
        if (!c.appId().equals(p.get("app_id")) || !c.sellerId().equals(p.get("seller_id")))
            throw PaymentErrors.invalid("支付宝通知商户不匹配");
        String currency = p.get("currency");
        if (currency != null && !"CNY".equals(currency)) throw PaymentErrors.invalid("支付宝通知币种不匹配");
        String status = state(p.get("trade_status"));
        Instant paidAt = "SUCCESS".equals(status) ? paidAt(p.get("gmt_payment")) : null;
        return result(
                c,
                p.get("out_trade_no"),
                p.get("trade_no"),
                status,
                cents(p.get("total_amount")),
                paidAt);
    }

    private DefaultAlipayClient client(AlipayConfigDTO c) throws AlipayApiException {
        validate(c);
        var config = new AlipayConfig();
        config.setServerUrl(c.gatewayUrl());
        config.setAppId(c.appId());
        config.setPrivateKey(key(c.appPrivateKey()));
        config.setAlipayPublicKey(key(c.alipayPublicKey()));
        config.setFormat("json");
        config.setCharset("UTF-8");
        config.setSignType("RSA2");
        config.setConnectTimeout(5000);
        config.setReadTimeout(8000);
        return new DefaultAlipayClient(config);
    }

    private PaymentResultDTO result(
            AlipayConfigDTO c,
            String id,
            String transaction,
            String state,
            int cents,
            Instant paidAt) {
        return new PaymentResultDTO(
                id, c.sellerId(), c.appId(), transaction, state, "CNY", cents, paidAt, "alipay");
    }

    private String state(String status) {
        if (status == null) throw PaymentErrors.invalid("支付宝交易状态缺失");
        return switch (status) {
            case "TRADE_SUCCESS", "TRADE_FINISHED" -> "SUCCESS";
            case "WAIT_BUYER_PAY" -> "NOTPAY";
            case "TRADE_CLOSED" -> "CLOSED";
            default -> throw PaymentErrors.invalid("支付宝交易状态无效");
        };
    }

    private int cents(String value) {
        try {
            if (value == null || !value.matches("[0-9]{1,10}(\\.[0-9]{1,2})?"))
                throw PaymentErrors.invalid("支付宝金额格式错误");
            int amount = new BigDecimal(value).movePointRight(2).intValueExact();
            if (amount <= 0) throw PaymentErrors.invalid("支付宝金额无效");
            return amount;
        } catch (ArithmeticException e) {
            throw PaymentErrors.invalid("支付宝金额超出范围");
        }
    }

    private Instant paidAt(String value) {
        try {
            return ServerTime.instant(LocalDateTime.parse(value, TIME));
        } catch (DateTimeParseException | NullPointerException e) {
            throw PaymentErrors.invalid("支付宝付款时间格式错误");
        }
    }

    private String key(String value) {
        return value.replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replace("-----BEGIN PUBLIC KEY-----", "")
                .replace("-----END PUBLIC KEY-----", "")
                .replaceAll("\\s", "");
    }

    private void requireSuccess(AlipayResponse response, String orderId) {
        if (!response.isSuccess()) {
            LOG.warn(
                    "Alipay request rejected for order {}, code {}, subcode {}",
                    orderId,
                    response.getCode(),
                    response.getSubCode());
            throw PaymentErrors.upstream();
        }
    }

    private RuntimeException upstream(String orderId, AlipayApiException e) {
        LOG.warn(
                "Alipay request failed for order {}, code {}, type {}, cause {}",
                orderId,
                e.getErrCode(),
                e.getClass().getSimpleName(),
                rootCause(e).getClass().getSimpleName());
        return PaymentErrors.upstream();
    }

    private Throwable rootCause(Throwable error) {
        Throwable cause = error;
        for (int depth = 0; depth < 8 && cause.getCause() != null; depth++) {
            cause = cause.getCause();
        }
        return cause;
    }
}
