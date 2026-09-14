package com.interview.copilot.service.impl.payment;

import com.interview.copilot.converter.payment.PaymentConverter;
import com.interview.copilot.entity.payment.PaymentCheckoutEntity;
import com.interview.copilot.entity.payment.PaymentOrderEntity;
import com.interview.copilot.exception.payment.PaymentErrors;
import com.interview.copilot.mapper.payment.PaymentCheckoutMapper;
import com.interview.copilot.mapper.payment.PaymentOrderMapper;
import com.interview.copilot.response.payment.PaymentCheckoutResponse;
import com.interview.copilot.service.payment.PaymentCheckoutService;
import com.interview.copilot.service.payment.PaymentProviderService;
import com.interview.copilot.util.ServerTime;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.HexFormat;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 浏览器支付收银台处理。
 */
@Service
public class PaymentCheckoutServiceImpl implements PaymentCheckoutService {
    private final PaymentOrderMapper orders;
    private final PaymentCheckoutMapper tickets;
    private final PaymentProviderService providers;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public PaymentCheckoutServiceImpl(
            PaymentOrderMapper orders,
            PaymentCheckoutMapper tickets,
            PaymentProviderService providers,
            Clock clock) {
        this.orders = orders;
        this.tickets = tickets;
        this.providers = providers;
        this.clock = clock;
    }

    @Transactional
    public PaymentCheckoutResponse issue(long userId, String orderId) {
        var order = orders.lock(orderId);
        if (order == null || order.userId() != userId) throw PaymentErrors.missing();
        payable(order);
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String ticket = HexFormat.of().formatHex(bytes);
        var expires = ServerTime.now(clock).plusMinutes(2);
        if (expires.isAfter(order.expiresAt())) expires = order.expiresAt();
        tickets.insert(order.id(), hash(ticket), expires);
        return new PaymentCheckoutResponse("/api/v1/payments/" + order.paymentMethod() + "/checkout?ticket=" + ticket);
    }

    public String confirm(String ticket) {
        var entry = ticket(ticket);
        var order = orders.find(entry.orderId());
        payable(order);
        String label = "支付宝";
        return "<!doctype html><html lang=zh-CN><meta charset=utf-8><meta name=viewport"
                   + " content='width=device-width,initial-scale=1'>"
                   + "<title>付款</title><body><h1>前往" + label + "收银台</h1>"
                   + "<p>请在收银台核对金额后付款，完成后返回客户端查看结果。</p><form method=post"
                   + " action='/api/v1/payments/" + order.paymentMethod() + "/checkout'><input type=hidden name=ticket"
                   + " value='"
                + ticket
                + "'>"
                + "<button type=submit>继续付款</button></form></body></html>";
    }

    @Transactional
    public String submit(String ticket) {
        var entry = ticket(ticket);
        var order = orders.lock(entry.orderId());
        payable(order);
        if (tickets.consume(entry.id(), ServerTime.now(clock)) != 1)
            throw PaymentErrors.invalid("付款入口已使用，请返回客户端重新打开");
        return providers.create(order.paymentMethod(), order.configVersion(), PaymentConverter.orderDTO(order));
    }

    public void cleanup() {
        tickets.cleanup(ServerTime.now(clock).minusDays(1));
    }

    private PaymentCheckoutEntity ticket(String value) {
        if (value == null || !value.matches("[a-f0-9]{64}")) throw PaymentErrors.missing();
        var ticket = tickets.find(hash(value));
        if (ticket == null
                || ticket.consumed()
                || !ticket.expiresAt().isAfter(ServerTime.now(clock)))
            throw PaymentErrors.invalid("付款入口已失效，请返回客户端重新打开");
        return ticket;
    }

    private void payable(PaymentOrderEntity order) {
        if (order == null) throw PaymentErrors.missing();
        if (!"alipay".equals(order.paymentMethod())
                || !"pending".equals(order.status())
                || order.credited()
                || !order.expiresAt().isAfter(ServerTime.now(clock)))
            throw PaymentErrors.invalid("订单当前不可付款，请返回客户端查看结果");
    }

    private String hash(String value) {
        try {
            return HexFormat.of()
                    .formatHex(
                            MessageDigest.getInstance("SHA-256")
                                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 unavailable", error);
        }
    }
}
