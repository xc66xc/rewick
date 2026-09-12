package com.interview.copilot.service.impl.payment;

import com.interview.copilot.dto.payment.ManualRefundDTO;
import com.interview.copilot.dto.payment.PaymentResultDTO;
import com.interview.copilot.entity.payment.PaymentOrderEntity;
import com.interview.copilot.exception.payment.PaymentErrors;
import com.interview.copilot.mapper.payment.PaymentOrderMapper;
import com.interview.copilot.mapper.wallet.WalletMapper;
import com.interview.copilot.service.payment.PaymentConfigService;
import com.interview.copilot.service.payment.PaymentFulfillmentService;
import com.interview.copilot.service.wallet.WalletService;
import com.interview.copilot.util.ServerTime;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Objects;

@Service
public class PaymentFulfillmentServiceImpl implements PaymentFulfillmentService {
    private final PaymentOrderMapper orders;
    private final WalletMapper mapper;
    private final WalletService wallets;
    private final PaymentConfigService configs;
    private final Clock clock;

    public PaymentFulfillmentServiceImpl(
            PaymentOrderMapper orders,
            WalletMapper mapper,
            WalletService wallets,
            PaymentConfigService configs,
            Clock clock) {
        this.orders = orders;
        this.mapper = mapper;
        this.wallets = wallets;
        this.configs = configs;
        this.clock = clock;
    }

    @Transactional
    public void credit(PaymentResultDTO result) {
        var order = lock(result.orderId());
        validate(order, result);
        if (order.credited()) {
            if (!Objects.equals(order.transactionId(), result.transactionId()))
                throw PaymentErrors.invalid("支付交易号不匹配");
            return;
        }
        long before = mapper.lockWallet(order.userId()).availableSeconds();
        long after = Math.addExact(before, order.durationSeconds());
        mapper.balance(order.userId(), after, ServerTime.now(clock));
        orders.ledger(
                order.userId(),
                order.databaseId(),
                "purchase",
                before,
                after,
                "购买套餐：" + order.packageName(),
                null);
        orders.paid(order.id(), result.transactionId(), ServerTime.local(result.paidAt()));
    }

    @Transactional
    public void refund(long actorId, String orderId, ManualRefundDTO p) {
        var order = lock(orderId);
        var previous = orders.refund(p.requestId());
        if (previous == null) previous = orders.refundByReference(p.reference());
        if (previous != null) {
            if (previous.orderId() != order.databaseId()
                    || previous.refundCents() != p.refundCents()
                    || previous.deductSeconds() != p.deductSeconds()
                    || !previous.reference().equals(p.reference())
                    || !previous.reason().equals(p.reason()))
                throw PaymentErrors.conflict("REFUND_REQUEST_REUSED", "请求标识已用于其他退款记录");
            return;
        }
        validateRefund(order, p);
        long before = mapper.lockWallet(order.userId()).availableSeconds();
        if (before < p.deductSeconds())
            throw PaymentErrors.conflict("INSUFFICIENT_DURATION", "可用时长不足以扣回，请调整扣回时长");
        long after = before - p.deductSeconds();
        mapper.balance(order.userId(), after, ServerTime.now(clock));
        orders.insertRefund(
                order.databaseId(),
                p.requestId(),
                p.refundCents(),
                p.deductSeconds(),
                p.reference(),
                p.reason(),
                actorId);
        orders.ledger(
                order.userId(), order.databaseId(), "refund", before, after, p.reason(), actorId);
        orders.refunded(order.databaseId(), p.refundCents(), p.deductSeconds());
        shorten(order.userId(), after);
    }

    private PaymentOrderEntity lock(String id) {
        var found = orders.find(id);
        if (found == null || mapper.lockUser(found.userId()) == null) throw PaymentErrors.missing();
        mapper.ensureWallet(found.userId());
        mapper.lockWallet(found.userId());
        // Settle the old session before changing balance; never revive its elapsed lease.
        wallets.state(found.userId());
        return orders.lock(id);
    }

    private void validate(PaymentOrderEntity o, PaymentResultDTO r) {
        var config = configs.forOrder(o.configVersion());
        boolean valid =
                "SUCCESS".equals(r.state())
                        && "CNY".equals(r.currency())
                        && o.totalCents() == r.totalCents()
                        && o.id().equals(r.orderId())
                        && config.mchId().equals(r.mchId())
                        && config.appId().equals(r.appId())
                        && r.transactionId() != null
                        && !r.transactionId().isBlank()
                        && r.paidAt() != null;
        if (!valid) throw PaymentErrors.invalid("支付通知与订单不匹配");
    }

    private void validateRefund(PaymentOrderEntity o, ManualRefundDTO p) {
        if (!o.credited() || !"paid".equals(o.status()))
            throw PaymentErrors.invalid("只有已支付到账订单可以登记退款");
        if (p.refundCents() <= 0 || p.refundCents() > o.totalCents() - o.refundedCents())
            throw PaymentErrors.invalid("退款金额超过订单剩余可退款金额");
        if (p.deductSeconds() < 0 || p.deductSeconds() > o.durationSeconds() - o.deductedSeconds())
            throw PaymentErrors.invalid("扣回时长超过订单剩余可扣回时长");
    }

    private void shorten(long userId, long balance) {
        var s = mapper.latest(userId);
        if (s == null || !"active".equals(s.status())) return;
        var now = ServerTime.now(clock);
        var exhaustion = s.startedAt().plusSeconds(s.usedSeconds() + balance);
        var expiry = exhaustion.isBefore(s.expiresAt()) ? exhaustion : s.expiresAt();
        mapper.save(
                s.update(
                        expiry,
                        balance == 0 ? now : null,
                        s.usedSeconds(),
                        balance == 0 ? "exhausted" : null),
                now);
    }
}
