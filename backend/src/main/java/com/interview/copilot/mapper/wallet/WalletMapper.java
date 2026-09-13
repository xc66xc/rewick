package com.interview.copilot.mapper.wallet;

import com.interview.copilot.entity.wallet.InterviewSessionEntity;
import com.interview.copilot.entity.wallet.WalletEntity;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface WalletMapper {
    String SESSION_COLUMNS =
            "session_id AS id,app_users_id AS"
                + " user_id,status,started_at,expires_at,ended_at,used_seconds,end_reason,auth_tokens_id";

    @Select("SELECT clock_timestamp() AT TIME ZONE 'Asia/Shanghai'")
    LocalDateTime now();

    @Select("SELECT id FROM app_users WHERE id=#{userId} FOR UPDATE")
    Long lockUser(long userId);

    @Insert("INSERT INTO time_wallets(app_users_id) VALUES(#{userId}) ON CONFLICT DO NOTHING")
    void ensureWallet(long userId);

    @Select(
            "SELECT available_seconds,version FROM time_wallets WHERE app_users_id=#{userId} FOR"
                    + " UPDATE")
    WalletEntity lockWallet(long userId);

    @Select("SELECT is_enabled FROM app_users WHERE id=#{userId}")
    boolean enabled(long userId);

    @Update(
            "UPDATE time_wallets SET"
                    + " available_seconds=#{seconds},version=version+1,updated_at=#{now} WHERE"
                    + " app_users_id=#{userId}")
    void balance(
            @Param("userId") long userId,
            @Param("seconds") long seconds,
            @Param("now") LocalDateTime now);

    @Select(
            "SELECT "
                    + SESSION_COLUMNS
                    + " FROM interview_sessions WHERE app_users_id=#{userId} ORDER BY"
                    + " interview_sessions.id DESC LIMIT 1")
    InterviewSessionEntity latest(long userId);

    @Select(
            "SELECT "
                    + SESSION_COLUMNS
                    + " FROM interview_sessions WHERE app_users_id=#{userId} AND session_id=#{id}")
    InterviewSessionEntity byId(@Param("userId") long userId, @Param("id") String id);

    @Select(
            "SELECT "
                    + SESSION_COLUMNS
                    + " FROM interview_sessions WHERE app_users_id=#{userId} AND"
                    + " request_id=#{requestId}")
    InterviewSessionEntity byRequest(
            @Param("userId") long userId, @Param("requestId") String requestId);

    @Insert(
            "INSERT INTO"
                + " interview_sessions(session_id,app_users_id,request_id,started_at,expires_at,auth_tokens_id)"
                + " VALUES(#{id},#{userId},#{requestId},#{now},#{expiry},#{tokenId})")
    void create(
            @Param("userId") long userId,
            @Param("id") String id,
            @Param("requestId") String requestId,
            @Param("now") LocalDateTime now,
            @Param("expiry") LocalDateTime expiry,
            @Param("tokenId") Long tokenId);

    @Update(
            "UPDATE interview_sessions SET"
                + " status=#{session.status},expires_at=#{session.expiresAt},ended_at=#{session.endedAt},used_seconds=#{session.usedSeconds},end_reason=#{session.endReason},updated_at=#{now}"
                + " WHERE session_id=#{session.id}")
    void save(@Param("session") InterviewSessionEntity session, @Param("now") LocalDateTime now);

    @Update(
            "UPDATE time_wallets SET available_seconds=#{seconds},updated_at=#{now} WHERE"
                    + " app_users_id=#{userId}")
    void consumedBalance(
            @Param("userId") long userId,
            @Param("seconds") long seconds,
            @Param("now") LocalDateTime now);

    @Insert(
            "INSERT INTO"
                + " time_wallet_transactions(app_users_id,operation,delta_seconds,before_seconds,after_seconds,reason,session_id,created_at)"
                + " VALUES(#{userId},'consume',#{after}-#{before},#{before},#{after},'面试使用',#{sessionId},#{now})")
    void debit(
            @Param("userId") long userId,
            @Param("sessionId") String sessionId,
            @Param("before") long before,
            @Param("after") long after,
            @Param("now") LocalDateTime now);

    @Select(
            "SELECT s.app_users_id FROM interview_sessions s JOIN app_users u ON"
                + " u.id=s.app_users_id WHERE s.status='active' AND (s.expires_at<=#{now} OR NOT"
                + " u.is_enabled)")
    List<Long> expiredUsers(LocalDateTime now);

    @Select(
            "SELECT EXISTS(SELECT 1 FROM interview_sessions s JOIN app_users u ON"
                + " u.id=s.app_users_id WHERE s.app_users_id=#{userId} AND s.session_id=#{id} AND"
                + " s.status='active' AND s.expires_at>#{now} AND u.is_enabled)")
    boolean active(
            @Param("userId") long userId, @Param("id") String id, @Param("now") LocalDateTime now);
}
