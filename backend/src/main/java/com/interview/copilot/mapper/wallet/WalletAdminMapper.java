package com.interview.copilot.mapper.wallet;

import com.interview.copilot.request.wallet.WalletAdjustmentRequest;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Mapper
public interface WalletAdminMapper {
    @Select(
            "SELECT operation,requested_seconds,expected_version,reason,actor_id FROM"
                    + " time_wallet_transactions WHERE app_users_id=#{userId} AND"
                    + " request_id=#{requestId}")
    Map<String, Object> adjustment(
            @Param("userId") long userId, @Param("requestId") String requestId);

    @Insert(
            "INSERT INTO"
                + " time_wallet_transactions(app_users_id,request_id,operation,requested_seconds,expected_version,delta_seconds,before_seconds,after_seconds,reason,actor_id,created_at)"
                + " VALUES(#{userId},#{input.requestId},#{input.operation},#{input.seconds},#{input.expectedVersion},#{after}-#{before},#{before},#{after},#{input.reason},#{actor},#{now})")
    void insertAdjustment(
            @Param("userId") long userId,
            @Param("input") WalletAdjustmentRequest input,
            @Param("before") long before,
            @Param("after") long after,
            @Param("actor") long actor,
            @Param("now") LocalDateTime now);

    @Select(
            "SELECT"
                + " t.id::text,t.delta_seconds,t.before_seconds,t.after_seconds,t.reason,u.display_name"
                + " AS actor_display_name,t.session_id,t.created_at FROM time_wallet_transactions t"
                + " LEFT JOIN app_users u ON u.id=t.actor_id WHERE t.app_users_id=#{userId} ORDER"
                + " BY t.id DESC LIMIT #{size} OFFSET #{offset}")
    List<TransactionRow> transactions(
            @Param("userId") long userId, @Param("size") int size, @Param("offset") int offset);

    @Select("SELECT count(id) FROM time_wallet_transactions WHERE app_users_id=#{userId}")
    long count(long userId);

    @Select(
            "SELECT EXISTS(SELECT 1 FROM app_users WHERE id=#{actor} AND role='ADMIN' AND"
                    + " is_enabled)")
    boolean authorized(long actor);

    record TransactionRow(
            String id,
            long deltaSeconds,
            long beforeSeconds,
            long afterSeconds,
            String reason,
            String actorDisplayName,
            String sessionId,
            LocalDateTime createdAt) {}
}
