package com.interview.copilot.mapper.payment;

import com.interview.copilot.entity.payment.PaymentCheckoutEntity;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 浏览器收银台票据持久化。
 */
@Mapper
public interface PaymentCheckoutMapper {
    @Insert(
            "INSERT INTO payment_checkout_tickets(payment_orders_id,ticket_hash,expires_at) SELECT"
                + " id,#{hash},#{expires} FROM payment_orders WHERE order_id=#{orderId}")
    void insert(
            @Param("orderId") String orderId,
            @Param("hash") String hash,
            @Param("expires") LocalDateTime expires);

    @Select(
            "SELECT t.id,o.order_id,t.is_consumed AS consumed,t.expires_at FROM"
                + " payment_checkout_tickets t JOIN payment_orders o ON o.id=t.payment_orders_id"
                + " WHERE t.ticket_hash=#{hash}")
    PaymentCheckoutEntity find(String hash);

    @Update(
            "UPDATE payment_checkout_tickets SET is_consumed=TRUE,updated_at=LOCALTIMESTAMP WHERE"
                + " id=#{id} AND NOT is_consumed AND expires_at>#{now}")
    int consume(@Param("id") long id, @Param("now") LocalDateTime now);

    @Select(
            "SELECT EXISTS(SELECT 1 FROM payment_checkout_tickets t JOIN payment_orders o ON"
                + " o.id=t.payment_orders_id WHERE o.order_id=#{orderId} AND t.is_consumed)")
    boolean submitted(String orderId);

    @Delete(
            "DELETE FROM payment_checkout_tickets t USING payment_orders o WHERE"
                + " t.payment_orders_id=o.id AND t.expires_at<#{before} AND o.status IN"
                + " ('paid','closed') AND (o.payment_method<>'zpay' OR o.is_credited"
                + " OR NOT t.is_consumed OR o.created_at<#{before}-INTERVAL '29 days')")
    void cleanup(LocalDateTime before);
}
