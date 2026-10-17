package com.interview.copilot.mapper.mockinterview;

import com.interview.copilot.entity.wallet.WalletEntity;
import com.interview.copilot.entity.mockinterview.MockPeriodEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Update;
import org.apache.ibatis.annotations.Param;
import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface MockWalletMapper {
 @Select("SELECT id FROM app_users WHERE id=#{user} FOR UPDATE") Long lockUser(long user);
 @Select("SELECT is_enabled FROM app_users WHERE id=#{user}") boolean enabled(long user);
 @Select("SELECT clock_timestamp() AT TIME ZONE 'Asia/Shanghai'") LocalDateTime now();
 @Insert("INSERT INTO mock_wallets(app_users_id) VALUES(#{user}) ON CONFLICT DO NOTHING") void ensure(long user);
 @Select("SELECT available_seconds,version FROM mock_wallets WHERE app_users_id=#{user} FOR UPDATE") WalletEntity wallet(long user);
 @Update("UPDATE mock_wallets SET available_seconds=#{balance},version=version+1,updated_at=LOCALTIMESTAMP(6) WHERE app_users_id=#{user}")
 void balance(@Param("user") long user,@Param("balance") long balance);
 @Select("SELECT jsonb_build_object('id',id,'deltaSeconds',delta_seconds,'balanceAfterSeconds',balance_after_seconds,'reason',reason,'createdAt',created_at)::text FROM mock_wallet_ledger WHERE app_users_id=#{user} AND (#{cursor}::bigint IS NULL OR id<#{cursor}) ORDER BY id DESC LIMIT 50")
 List<String> ledger(@Param("user") long user,@Param("cursor") Long cursor);
 @Select("SELECT jsonb_build_object('deltaSeconds',delta_seconds,'reason',reason)::text FROM mock_wallet_ledger WHERE app_users_id=#{user} AND request_id=CAST(#{request} AS uuid)")
 String adjustment(@Param("user") long user,@Param("request") String request);
 @Insert("INSERT INTO mock_wallet_ledger(app_users_id,request_id,delta_seconds,balance_after_seconds,reason,actor_app_users_id,session_id) VALUES(#{user},CAST(#{request} AS uuid),#{delta},#{balance},#{reason},#{actor},CAST(#{session} AS uuid))")
 void entry(@Param("user") long user,@Param("request") String request,@Param("delta") long delta,@Param("balance") long balance,@Param("reason") String reason,@Param("actor") Long actor,@Param("session") String session);
 @Select("SELECT id::text,session_id::text,started_at,expires_at,used_seconds FROM mock_usage_periods WHERE app_users_id=#{user} AND ended_at IS NULL FOR UPDATE") MockPeriodEntity active(long user);
 @Insert("INSERT INTO mock_usage_periods(id,session_id,app_users_id,started_at,expires_at) VALUES(CAST(#{id} AS uuid),CAST(#{session} AS uuid),#{user},#{now},#{expiry})")
 void start(@Param("user") long user,@Param("id") String id,@Param("session") String session,@Param("now") LocalDateTime now,@Param("expiry") LocalDateTime expiry);
 @Update("UPDATE mock_usage_periods SET used_seconds=#{used},expires_at=#{expiry},ended_at=#{ended} WHERE id=CAST(#{id} AS uuid)")
 void period(@Param("id") String id,@Param("used") long used,@Param("expiry") LocalDateTime expiry,@Param("ended") LocalDateTime ended);
 @Select("SELECT EXISTS(SELECT 1 FROM interview_sessions WHERE app_users_id=#{user} AND status='active' AND expires_at>(clock_timestamp() AT TIME ZONE 'Asia/Shanghai'))") boolean assistActive(long user);
 @Select("SELECT EXISTS(SELECT 1 FROM mock_usage_periods WHERE app_users_id=#{user} AND ended_at IS NULL AND expires_at>(clock_timestamp() AT TIME ZONE 'Asia/Shanghai'))") boolean mockActive(long user);
 @Insert("INSERT INTO interview_activity_leases(app_users_id,mode,session_id,expires_at) VALUES(#{user},#{mode},#{session},#{expiry}) ON CONFLICT(app_users_id) DO UPDATE SET mode=EXCLUDED.mode,session_id=EXCLUDED.session_id,expires_at=EXCLUDED.expires_at")
 void lease(@Param("user") long user,@Param("mode") String mode,@Param("session") String session,@Param("expiry") LocalDateTime expiry);
 @Update("DELETE FROM interview_activity_leases WHERE app_users_id=#{user} AND mode=#{mode}") void release(@Param("user") long user,@Param("mode") String mode);
}
