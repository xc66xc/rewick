package com.interview.copilot.mapper.observability;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Options;

@Mapper
public interface OperationsBusinessMapper {
    @Options(timeout=1)
    @Select("""
        WITH period AS (SELECT LOCALTIMESTAMP - make_interval(hours => #{hours}) AS since),
        sessions AS (SELECT s.app_users_id,s.status,s.used_seconds,s.started_at,s.expires_at
        FROM interview_sessions s JOIN app_users u ON u.id=s.app_users_id
        WHERE u.role='USER' AND s.started_at >= (SELECT since FROM period)),
        orders AS (SELECT p.status,p.app_users_id,p.total_cents,p.paid_at FROM payment_orders p
        JOIN app_users u ON u.id=p.app_users_id WHERE u.role='USER' AND p.created_at >= (SELECT since FROM period)),
        payments AS (SELECT p.app_users_id,p.total_cents FROM payment_orders p JOIN app_users u ON u.id=p.app_users_id
        WHERE u.role='USER' AND p.status='paid' AND p.paid_at >= (SELECT since FROM period)),
        refunds AS (SELECT COALESCE(sum(r.refund_cents),0) AS cents FROM payment_manual_refunds r
        JOIN payment_orders p ON p.id=r.payment_orders_id JOIN app_users u ON u.id=p.app_users_id
        WHERE u.role='USER' AND r.created_at >= (SELECT since FROM period))
        SELECT json_build_object('activeUsers',(SELECT count(DISTINCT s.app_users_id) FROM interview_sessions s JOIN app_users u ON u.id=s.app_users_id WHERE u.role='USER' AND s.started_at>=date_trunc('day',LOCALTIMESTAMP)),
        'newUsers',(SELECT count(*) FROM app_users WHERE role='USER' AND created_at >= (SELECT since FROM period)),
        'interviews',(SELECT count(*) FROM sessions),
        'usedSeconds',(SELECT COALESCE(sum(-t.delta_seconds),0) FROM time_wallet_transactions t
        JOIN app_users u ON u.id=t.app_users_id WHERE t.operation='consume' AND u.role='USER' AND t.created_at >= (SELECT since FROM period)),
        'paidUsers',(SELECT count(DISTINCT app_users_id) FROM payments),
        'paidCents',(SELECT COALESCE(sum(total_cents),0) FROM payments),'refundCents',(SELECT cents FROM refunds),
        'netCents',(SELECT COALESCE(sum(total_cents),0) FROM payments)-(SELECT cents FROM refunds),
        'orders',json_build_object('total',(SELECT count(*) FROM orders),'paid',(SELECT count(*) FROM orders WHERE status='paid'),
        'pending',(SELECT count(*) FROM orders WHERE status IN ('pending','creating')),
        'closed',(SELECT count(*) FROM orders WHERE status='closed'),'failed',(SELECT count(*) FROM orders WHERE status='failed')),
        'activeUsersPeriod','beijing_today','usedSecondsPeriod','selected_window','source','business_database',
        'updatedAt',to_char(LOCALTIMESTAMP,'YYYY-MM-DD"T"HH24:MI:SS.US')||'+08:00','stale',false)::text
        """)
    String summary(int hours);
}
