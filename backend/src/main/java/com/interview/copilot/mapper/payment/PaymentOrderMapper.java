package com.interview.copilot.mapper.payment;

import com.interview.copilot.entity.payment.ManualRefundEntity;
import com.interview.copilot.entity.payment.PaymentOrderEntity;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface PaymentOrderMapper {
    String COLUMNS =
            "o.id AS database_id,o.order_id AS id,o.app_users_id AS"
                + " user_id,u.display_name,o.time_packages_id AS"
                + " package_id,o.package_version,o.package_name,o.duration_seconds,o.total_cents,o.payment_config_versions_id"
                + " AS config_version,o.status,o.is_credited AS"
                + " credited,o.code_url,o.transaction_id,o.created_at,o.expires_at,o.paid_at,o.refunded_cents,o.deducted_seconds,o.payment_method";
    String JOIN = " FROM payment_orders o JOIN app_users u ON u.id=o.app_users_id ";

    @Insert(
            "INSERT INTO payment_notifications(payment_orders_id,body_hash) SELECT id,#{hash} FROM"
                    + " payment_orders WHERE order_id=#{orderId} ON CONFLICT(body_hash) DO NOTHING")
    void notification(@Param("orderId") String orderId, @Param("hash") String hash);

    @Select("SELECT " + COLUMNS + JOIN + " WHERE o.order_id=#{id}")
    PaymentOrderEntity find(String id);

    @Select(
            "SELECT "
                    + COLUMNS
                    + JOIN
                    + " WHERE o.app_users_id=#{userId} AND o.status IN"
                    + " ('creating','pending','cancelling') ORDER BY o.id LIMIT 1")
    PaymentOrderEntity active(long userId);

    @Select("SELECT " + COLUMNS + JOIN + " WHERE o.order_id=#{id} FOR UPDATE OF o")
    PaymentOrderEntity lock(String id);

    @Select(
            "SELECT "
                    + COLUMNS
                    + JOIN
                    + " WHERE o.app_users_id=#{userId} AND o.request_id=#{requestId}")
    PaymentOrderEntity byRequest(
            @Param("userId") long userId, @Param("requestId") String requestId);

    @Select(
            "<script>SELECT "
                    + COLUMNS
                    + JOIN
                    + "<if test='userId != null'> WHERE o.app_users_id=#{userId}</if> ORDER BY o.id"
                    + " DESC LIMIT 100</script>")
    List<PaymentOrderEntity> list(@Param("userId") Long userId);

    @Insert(
            "INSERT INTO"
                + " payment_orders(order_id,app_users_id,request_id,time_packages_id,package_version,package_name,duration_seconds,total_cents,payment_config_versions_id,expires_at,created_at,updated_at,payment_method,client_ip)"
                + " VALUES(#{o.id},#{o.userId},#{requestId},#{o.packageId},#{o.packageVersion},#{o.packageName},#{o.durationSeconds},#{o.totalCents},#{o.configVersion},#{o.expiresAt},#{o.createdAt},#{o.createdAt},#{o.paymentMethod},#{clientIp})")
    void create(@Param("o") PaymentOrderEntity o, @Param("requestId") String requestId,
            @Param("clientIp") String clientIp);

    @Select("SELECT client_ip FROM payment_orders WHERE order_id=#{id}")
    String clientIp(String id);

    @Update("UPDATE payment_orders SET is_create_attempted=TRUE WHERE order_id=#{id}"
            + " AND payment_method='zpay' AND status='creating' AND NOT is_create_attempted"
            + " AND expires_at>LOCALTIMESTAMP")
    int claimZpayCreate(String id);

    @Update(
            "UPDATE payment_orders SET status='pending',updated_at=LOCALTIMESTAMP WHERE"
                + " order_id=#{id} AND status='creating'")
    void ready(String id);

    @Update(
            "UPDATE payment_orders SET status='cancelling',updated_at=LOCALTIMESTAMP WHERE"
                + " order_id=#{id} AND status IN ('creating','pending')")
    void cancelling(String id);

    @Update(
            "UPDATE payment_orders SET last_query_at=#{now} WHERE order_id=#{id} AND (status IN"
                + " ('creating','pending','cancelling') OR (status='paid' AND NOT is_credited) OR (status='closed' AND payment_method='zpay' AND NOT is_credited)) AND"
                + " (last_query_at IS NULL OR last_query_at < #{threshold})")
    int claimQuery(
            @Param("id") String id,
            @Param("now") LocalDateTime now,
            @Param("threshold") LocalDateTime threshold);

    @Update(
            "UPDATE payment_orders SET code_url=#{url},status='pending',updated_at=LOCALTIMESTAMP"
                    + " WHERE order_id=#{id} AND status='creating'")
    void qr(@Param("id") String id, @Param("url") String url);

    @Update(
            "UPDATE payment_orders SET status='closed',code_url=NULL,updated_at=LOCALTIMESTAMP"
                    + " WHERE order_id=#{id} AND status IN ('creating','pending','cancelling')")
    void close(String id);

    @Update(
            "UPDATE payment_orders SET"
                + " status='paid',is_credited=TRUE,transaction_id=#{transactionId},paid_at=#{paidAt},code_url=NULL,updated_at=LOCALTIMESTAMP"
                + " WHERE order_id=#{id}")
    void paid(
            @Param("id") String id,
            @Param("transactionId") String transactionId,
            @Param("paidAt") LocalDateTime paidAt);

    @Select(
            "SELECT order_id FROM payment_orders WHERE (status IN"
                + " ('creating','pending','cancelling') OR (status='paid' AND NOT is_credited)) AND"
                + " (last_query_at IS NULL OR last_query_at < #{threshold}) ORDER BY last_query_at"
                + " NULLS FIRST,id LIMIT 50")
    List<String> pending(LocalDateTime threshold);

    @Select("SELECT o.order_id FROM payment_orders o WHERE o.payment_method='zpay'"
            + " AND o.status='closed' AND NOT o.is_credited AND o.created_at>#{since}"
            + " AND (o.last_query_at IS NULL OR o.last_query_at<#{threshold})"
            + " AND o.is_create_attempted"
            + " ORDER BY o.last_query_at NULLS FIRST,o.id LIMIT 10")
    List<String> closedZpay(@Param("since") LocalDateTime since,
            @Param("threshold") LocalDateTime threshold);

    @Insert(
            "INSERT INTO"
                + " time_wallet_transactions(app_users_id,operation,delta_seconds,before_seconds,after_seconds,reason,payment_orders_id,actor_id)"
                + " VALUES(#{userId},#{operation},#{after}-#{before},#{before},#{after},#{reason},#{orderId},#{actorId})")
    void ledger(
            @Param("userId") long userId,
            @Param("orderId") long orderId,
            @Param("operation") String operation,
            @Param("before") long before,
            @Param("after") long after,
            @Param("reason") String reason,
            @Param("actorId") Long actorId);

    @Select(
            "SELECT payment_orders_id AS order_id,refund_cents,deduct_seconds,reference,reason FROM"
                    + " payment_manual_refunds WHERE request_id=#{id}")
    ManualRefundEntity refund(String id);

    @Select(
            "SELECT payment_orders_id AS order_id,refund_cents,deduct_seconds,reference,reason FROM"
                    + " payment_manual_refunds WHERE reference=#{reference} AND"
                    + " payment_method=#{paymentMethod}")
    ManualRefundEntity refundByReference(
            @Param("reference") String reference, @Param("paymentMethod") String paymentMethod);

    @Insert(
            "INSERT INTO"
                + " payment_manual_refunds(payment_orders_id,request_id,refund_cents,deduct_seconds,reference,reason,actor_id,payment_method)"
                + " VALUES(#{orderId},#{requestId},#{cents},#{seconds},#{reference},#{reason},#{actor},#{paymentMethod})")
    void insertRefund(
            @Param("orderId") long orderId,
            @Param("requestId") String requestId,
            @Param("cents") int cents,
            @Param("seconds") long seconds,
            @Param("reference") String reference,
            @Param("reason") String reason,
            @Param("actor") long actor,
            @Param("paymentMethod") String paymentMethod);

    @Update(
            "UPDATE payment_orders SET"
                + " refunded_cents=refunded_cents+#{cents},deducted_seconds=deducted_seconds+#{seconds},updated_at=LOCALTIMESTAMP"
                + " WHERE id=#{id}")
    void refunded(@Param("id") long id, @Param("cents") int cents, @Param("seconds") long seconds);
}
