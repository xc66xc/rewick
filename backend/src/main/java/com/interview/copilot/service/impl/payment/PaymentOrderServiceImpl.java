package com.interview.copilot.service.impl.payment;

import com.interview.copilot.converter.payment.PaymentConverter;
import com.interview.copilot.dto.payment.ManualRefundDTO;
import com.interview.copilot.dto.payment.PaymentHeadersDTO;
import com.interview.copilot.exception.payment.PaymentErrors;
import com.interview.copilot.mapper.payment.PaymentOrderMapper;
import com.interview.copilot.response.payment.PaymentOrderResponse;
import com.interview.copilot.service.payment.PaymentFulfillmentService;
import com.interview.copilot.service.payment.PaymentOrderService;
import com.interview.copilot.service.payment.PaymentReservationService;
import com.interview.copilot.service.payment.PaymentSyncService;

import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class PaymentOrderServiceImpl implements PaymentOrderService {
    private final PaymentOrderMapper orders;
    private final PaymentReservationService reservations;
    private final PaymentSyncService sync;
    private final PaymentFulfillmentService fulfillment;

    public PaymentOrderServiceImpl(
            PaymentOrderMapper orders,
            PaymentReservationService reservations,
            PaymentSyncService sync,
            PaymentFulfillmentService fulfillment) {
        this.orders = orders;
        this.reservations = reservations;
        this.sync = sync;
        this.fulfillment = fulfillment;
    }

    public PaymentOrderResponse create(
            long userId,
            long packageId,
            long packageVersion,
            String requestId,
            String paymentMethod) {
        var order =
                reservations.reserve(userId, packageId, packageVersion, requestId, paymentMethod);
        return refresh(userId, order.id());
    }

    public PaymentOrderResponse read(Long userId, String id) {
        var order = orders.find(id);
        if (order == null || (userId != null && order.userId() != userId))
            throw PaymentErrors.missing();
        return PaymentConverter.orderResponse(order, userId != null);
    }

    public List<PaymentOrderResponse> list(Long userId) {
        return orders.list(userId).stream()
                .map(o -> PaymentConverter.orderResponse(o, userId != null))
                .toList();
    }

    public PaymentOrderResponse refresh(Long userId, String id) {
        read(userId, id);
        sync.sync(id);
        return read(userId, id);
    }

    public PaymentOrderResponse refund(long actorId, String id, ManualRefundDTO input) {
        fulfillment.refund(actorId, id, input);
        return read(null, id);
    }

    public void notify(String body, PaymentHeadersDTO headers) {
        sync.notify(body, headers);
    }

    public void reconcile() {
        sync.reconcile();
    }
}
