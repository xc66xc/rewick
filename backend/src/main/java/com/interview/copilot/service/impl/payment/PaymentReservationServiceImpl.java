package com.interview.copilot.service.impl.payment;

import com.interview.copilot.converter.payment.PaymentConverter;
import com.interview.copilot.entity.payment.PaymentOrderEntity;
import com.interview.copilot.exception.payment.PaymentErrors;
import com.interview.copilot.mapper.payment.PaymentOrderMapper;
import com.interview.copilot.mapper.payment.TimePackageMapper;
import com.interview.copilot.response.payment.PaymentOrderResponse;
import com.interview.copilot.service.auth.SessionGuardService;
import com.interview.copilot.service.payment.PaymentProviderService;
import com.interview.copilot.service.payment.PaymentReservationService;
import com.interview.copilot.util.ServerTime;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.UUID;

@Service
public class PaymentReservationServiceImpl implements PaymentReservationService {
    private final PaymentOrderMapper orders;
    private final TimePackageMapper packages;
    private final SessionGuardService wallets;
    private final PaymentProviderService configs;
    private final Clock clock;

    public PaymentReservationServiceImpl(
            PaymentOrderMapper orders,
            TimePackageMapper packages,
            SessionGuardService wallets,
            PaymentProviderService configs,
            Clock clock) {
        this.orders = orders;
        this.packages = packages;
        this.wallets = wallets;
        this.configs = configs;
        this.clock = clock;
    }

    @Transactional
    public PaymentOrderResponse reserve(
            long userId,
            long packageId,
            long packageVersion,
            String requestId,
            String paymentMethod) {
        if (wallets.lockUser(userId) == null) throw PaymentErrors.missing();
        var previous = orders.byRequest(userId, requestId);
        if (previous != null) {
            if (previous.packageId() != packageId
                    || previous.packageVersion() != packageVersion
                    || !previous.paymentMethod().equals(paymentMethod))
                throw PaymentErrors.conflict("PAYMENT_REQUEST_REUSED", "请求标识已用于其他套餐");
            return PaymentConverter.orderResponse(previous, true);
        }
        var active = orders.active(userId);
        if (active != null) return PaymentConverter.orderResponse(active, true);
        long configVersion = configs.activeVersion(paymentMethod);
        var p = packages.lock(packageId);
        if (p == null || !p.enabled()) throw PaymentErrors.missing();
        if (p.version() != packageVersion)
            throw PaymentErrors.conflict("PACKAGE_CHANGED", "套餐已变更，请重新确认价格");
        var now = ServerTime.now(clock);
        var id = UUID.randomUUID().toString().replace("-", "");
        if ("zpay".equals(paymentMethod))
            id = String.format("%032d", new java.math.BigInteger(id, 16)
                    .mod(java.math.BigInteger.TEN.pow(32)));
        var order =
                new PaymentOrderEntity(
                        0,
                        id,
                        userId,
                        "",
                        p.id(),
                        p.version(),
                        p.name(),
                        p.durationSeconds(),
                        p.priceCents(),
                        configVersion,
                        "creating",
                        false,
                        null,
                        null,
                        now,
                        now.plusMinutes(15),
                        null,
                        0,
                        0,
                        paymentMethod);
        orders.create(order, requestId);
        return PaymentConverter.orderResponse(orders.find(id), true);
    }
}
