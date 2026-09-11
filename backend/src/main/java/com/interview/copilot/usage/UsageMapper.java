package com.interview.copilot.usage;

import java.time.LocalDateTime;
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
    void expire(@Param("userId") long userId, @Param("now") LocalDateTime now);

    @Select("SELECT COUNT(id) FROM usage_events WHERE app_users_id = #{userId} AND capability = 'asr' AND status = 'started'")
    int activeAsr(long userId);

    @Insert("""
            INSERT INTO usage_events(app_users_id, request_id, capability, expires_at)
            VALUES(#{userId}, #{requestId}, #{capability}, #{expiresAt})
            """)
    void create(@Param("userId") long userId, @Param("requestId") String requestId,
            @Param("capability") String capability, @Param("expiresAt") LocalDateTime expiresAt);

    @Update("""
            UPDATE usage_events SET status = #{status}, finished_at = #{now}, updated_at = #{now}
            WHERE app_users_id = #{userId} AND request_id = #{requestId} AND capability = #{capability} AND status = 'started'
            """)
    void finish(@Param("userId") long userId, @Param("requestId") String requestId,
            @Param("capability") String capability, @Param("status") String status, @Param("now") LocalDateTime now);

    @Update("""
            UPDATE usage_events SET model = #{model}, updated_at = LOCALTIMESTAMP(6)
            WHERE app_users_id = #{userId} AND request_id = #{requestId} AND capability = #{capability}
                AND status = 'started' AND model = ''
            """)
    int describeModel(@Param("userId") long userId, @Param("requestId") String requestId,
            @Param("capability") String capability, @Param("model") String model);
}
