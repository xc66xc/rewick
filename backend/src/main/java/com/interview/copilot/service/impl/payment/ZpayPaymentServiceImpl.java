package com.interview.copilot.service.impl.payment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.interview.copilot.dto.payment.PaymentOrderDTO;
import com.interview.copilot.dto.payment.PaymentResultDTO;
import com.interview.copilot.dto.payment.ZpayConfigDTO;
import com.interview.copilot.exception.payment.PaymentErrors;
import com.interview.copilot.service.payment.ZpayPaymentService;
import com.interview.copilot.util.BoundedPaymentBodySubscriber;
import com.interview.copilot.util.ZpaySignature;
import com.interview.copilot.validation.payment.ZpayResultValidation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.CompletionException;
import java.util.concurrent.TimeUnit;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description ZPAY 二维码下单、限时查单和通知验签实现。
 */
@Service
public class ZpayPaymentServiceImpl implements ZpayPaymentService {
    private static final Logger LOG = LoggerFactory.getLogger(ZpayPaymentServiceImpl.class);
    private final ObjectMapper json;
    private final HttpClient http;

    @Autowired
    public ZpayPaymentServiceImpl(ObjectMapper json) {
        this(json, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3))
                .followRedirects(HttpClient.Redirect.NEVER).build());
    }

    ZpayPaymentServiceImpl(ObjectMapper json, HttpClient http) {
        this.json = json;
        this.http = http;
    }

    public String create(ZpayConfigDTO config, PaymentOrderDTO order) {
        Map<String, String> parameters = new TreeMap<>();
        if (order.clientIp() == null || order.clientIp().isBlank()) {
            throw PaymentErrors.invalid("ZPAY 下单缺少客户端 IP");
        }
        parameters.put("pid", config.pid());
        parameters.put("type", config.paymentType());
        parameters.put("out_trade_no", order.id());
        parameters.put("notify_url", config.notifyUrl());
        parameters.put("return_url", config.returnUrl());
        parameters.put("name", order.packageName());
        parameters.put("money", BigDecimal.valueOf(order.totalCents(), 2).toPlainString());
        if (config.cid() != null && !config.cid().isEmpty()) parameters.put("cid", config.cid());
        parameters.put("clientip", order.clientIp());
        parameters.put("device", "pc");
        parameters.put("sign", ZpaySignature.sign(parameters, config.merchantKey()));
        parameters.put("sign_type", "MD5");
        String boundary = "ZpayBoundary" + UUID.randomUUID().toString().replace("-", "");
        var request = HttpRequest.newBuilder(URI.create(config.gatewayUrl())).timeout(Duration.ofSeconds(3))
                .header("Accept", "*/*")
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofString(multipart(parameters, boundary), StandardCharsets.UTF_8))
                .build();
        JsonNode response = execute(request, order.id(), "create");
        JsonNode qr = response.path("qrcode");
        if (!"1".equals(response.path("code").asText()) || !qr.isTextual()
                || qr.asText().isBlank() || qr.asText().length() > 2048
                || qr.asText().chars().anyMatch(Character::isISOControl)) {
            LOG.warn("ZPAY create invalid business response or QR content for order {}", order.id());
            throw PaymentErrors.upstream();
        }
        return qr.asText();
    }

    private String multipart(Map<String, String> parameters, String boundary) {
        StringBuilder body = new StringBuilder();
        parameters.forEach((name, value) -> body.append("--").append(boundary).append("\r\n")
                .append("Content-Disposition: form-data; name=\"").append(name).append("\"\r\n\r\n")
                .append(value).append("\r\n"));
        return body.append("--").append(boundary).append("--\r\n").toString();
    }

    public PaymentResultDTO query(ZpayConfigDTO config, PaymentOrderDTO order) {
        JsonNode response = request(config, order.id());
        if ("0".equals(response.path("code").asText())
                && "订单编号不存在".equals(response.path("msg").asText())) {
            return new PaymentResultDTO(order.id(), config.pid(), config.paymentType(), null,
                    "NOTFOUND", "CNY", order.totalCents(), null, "zpay");
        }
        if (!"1".equals(response.path("code").asText())) {
            String code = response.path("code").asText();
            LOG.warn("ZPAY query rejected for order {}, business code {}", order.id(),
                    code.matches("-?[0-9]{1,6}") ? code : "invalid");
            throw PaymentErrors.upstream();
        }
        ZpayResultValidation.identity(config, response.path("pid").asText(), response.path("type").asText());
        String id = ZpayResultValidation.identifier(response.path("out_trade_no").asText());
        if (!order.id().equals(id)) throw PaymentErrors.invalid("ZPAY 查单订单不匹配");
        int cents = ZpayResultValidation.cents(response.path("money").asText());
        if (cents != order.totalCents()) throw PaymentErrors.invalid("ZPAY 查单金额不匹配");
        String state = state(response.path("status").asText());
        String transaction = ZpayResultValidation.identifier(response.path("trade_no").asText());
        return new PaymentResultDTO(id, config.pid(), config.paymentType(), transaction, state,
                "CNY", cents, "SUCCESS".equals(state)
                ? ZpayResultValidation.paidAt(response.path("endtime").asText()) : null, "zpay");
    }

    public PaymentResultDTO notification(ZpayConfigDTO config, Map<String, String> parameters) {
        ZpaySignature.verify(parameters, config.merchantKey());
        if (parameters.get("name") == null || parameters.get("name").isBlank()) {
            throw PaymentErrors.invalid("ZPAY 通知商品名称缺失");
        }
        ZpayResultValidation.identity(config, parameters.get("pid"), parameters.get("type"));
        if (!"TRADE_SUCCESS".equals(parameters.get("trade_status"))) {
            throw PaymentErrors.invalid("ZPAY 通知交易状态无效");
        }
        return new PaymentResultDTO(ZpayResultValidation.identifier(parameters.get("out_trade_no")),
                config.pid(), config.paymentType(),
                ZpayResultValidation.identifier(parameters.get("trade_no")), "SUCCESS", "CNY",
                ZpayResultValidation.cents(parameters.get("money")), null, "zpay");
    }

    private JsonNode request(ZpayConfigDTO config, String orderId) {
        URI uri = URI.create(config.queryUrl() + "?act=order&pid=" + encode(config.pid())
                + "&key=" + encode(config.merchantKey()) + "&out_trade_no=" + encode(orderId));
        var request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(3))
                // ZPAY double-encodes the response for Accept: application/json.
                .header("Accept", "*/*").GET().build();
        return execute(request, orderId, "query");
    }

    private JsonNode execute(HttpRequest request, String orderId, String operation) {
        long started = System.nanoTime();
        var pending = http.sendAsync(request, info -> new BoundedPaymentBodySubscriber());
        try {
            var response = pending.thenApply(value -> value).orTimeout(3, TimeUnit.SECONDS).join();
            LOG.debug("ZPAY {} response for order {}, HTTP {}, elapsedMs {}", operation, orderId,
                    response.statusCode(), TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started));
            if (response.statusCode() != 200) {
                LOG.warn("ZPAY {} failed for order {}, HTTP {}, elapsedMs {}", operation, orderId,
                        response.statusCode(), TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started));
                throw PaymentErrors.upstream();
            }
            return parseResponse(response.body(), orderId, operation);
        } catch (CompletionException error) {
            pending.cancel(true);
            // Exception messages can include the merchant key in the request URI.
            Throwable cause = error.getCause() == null ? error : error.getCause();
            LOG.warn("ZPAY {} failed for order {}, failure type {}, elapsedMs {}", operation, orderId,
                    cause.getClass().getSimpleName(), TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started));
            throw PaymentErrors.upstream();
        }
    }

    private JsonNode parseResponse(byte[] content, String orderId, String operation) {
        try {
            JsonNode body = json.readTree(content);
            if (body != null && body.isObject()) return body;
            LOG.warn("ZPAY {} invalid JSON structure for order {}", operation, orderId);
        } catch (JsonProcessingException error) {
            // Never log the response, URI, or parser message: any may contain secrets.
            var location = error.getLocation();
            LOG.warn("ZPAY {} invalid JSON for order {}, failure type {}, offset {}", operation, orderId,
                    error.getClass().getSimpleName(), location == null ? -1 : location.getByteOffset());
        } catch (IOException error) {
            LOG.warn("ZPAY {} unreadable JSON for order {}, failure type {}", operation, orderId,
                    error.getClass().getSimpleName());
        }
        throw PaymentErrors.upstream();
    }

    private String state(String status) {
        return switch (status) {
            case "0" -> "NOTPAY";
            case "1" -> "SUCCESS";
            default -> throw PaymentErrors.invalid("ZPAY 查单状态无效");
        };
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

}
