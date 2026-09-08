package com.interview.copilot.usage;

import java.time.Instant;
import java.time.LocalDate;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface UsageMapper {
    @Select("SELECT id FROM app_users WHERE id = #{userId} AND is_enabled = TRUE FOR UPDATE")
    Long lockUser(long userId);

    @Select("SELECT COUNT(id) FROM usage_events WHERE app_users_id = #{userId} AND request_id = #{requestId} AND capability = #{capability}")
    int countRequest(@Param("userId") long userId, @Param("requestId") String requestId, @Param("capability") String capability);

    @Update("""
            UPDATE usage_events SET status = 'expired', finished_at = #{now}, updated_at = #{now}
            WHERE app_users_id = #{userId} AND status = 'started' AND expires_at <= #{now}
            """)
    void expire(@Param("userId") long userId, @Param("now") Instant now);

    @Select("SELECT COUNT(id) FROM usage_events WHERE app_users_id = #{userId} AND capability = 'asr' AND status = 'started'")
    int activeAsr(long userId);

    @Insert("""
            INSERT INTO usage_daily(app_users_id, usage_day, capability) VALUES(#{userId}, #{day}, #{capability})
            ON CONFLICT(app_users_id, usage_day, capability) DO NOTHING
            """)
    void ensureDaily(@Param("userId") long userId, @Param("day") LocalDate day, @Param("capability") String capability);

    @Update("""
            UPDATE usage_daily SET used_count = used_count + 1, updated_at = CURRENT_TIMESTAMP
            WHERE app_users_id = #{userId} AND usage_day = #{day} AND capability = #{capability} AND used_count < #{limit}
            """)
    int reserveDaily(@Param("userId") long userId, @Param("day") LocalDate day,
            @Param("capability") String capability, @Param("limit") int limit);

    @Insert("""
            INSERT INTO usage_events(app_users_id, request_id, capability, expires_at)
            VALUES(#{userId}, #{requestId}, #{capability}, #{expiresAt})
            """)
    void create(@Param("userId") long userId, @Param("requestId") String requestId,
            @Param("capability") String capability, @Param("expiresAt") Instant expiresAt);

    @Update("""
            UPDATE usage_events SET status = #{status}, finished_at = #{now}, updated_at = #{now}
            WHERE app_users_id = #{userId} AND request_id = #{requestId} AND capability = #{capability} AND status = 'started'
            """)
    void finish(@Param("userId") long userId, @Param("requestId") String requestId,
            @Param("capability") String capability, @Param("status") String status, @Param("now") Instant now);
}
