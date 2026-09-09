package com.interview.copilot.auth.email;

import java.time.Instant;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface EmailCodeMapper {
    @Insert("""
            INSERT INTO email_verifications(email, next_send_at, window_started_at)
            VALUES(#{email}, #{now}, #{now}) ON CONFLICT(email) DO NOTHING
            """)
    void ensure(@Param("email") String email, @Param("now") Instant now);

    @Select("""
            SELECT email, code_digest, nonce, status, expires_at, next_send_at, window_started_at, send_count, failed_attempts
            FROM email_verifications WHERE email = #{email} FOR UPDATE
            """)
    Verification lock(String email);

    @Update("""
            UPDATE email_verifications SET code_digest = #{code.digest}, nonce = #{code.nonce}, status = 'pending',
                expires_at = #{expires}, next_send_at = #{next}, window_started_at = #{window}, send_count = #{count},
                failed_attempts = 0, updated_at = CURRENT_TIMESTAMP WHERE email = #{email}
            """)
    void reserve(@Param("email") String email, @Param("code") EmailCodeSecrets.Code code, @Param("expires") Instant expires,
            @Param("next") Instant next, @Param("window") Instant window, @Param("count") int count);

    @Update("""
            UPDATE email_verifications SET status = #{status}, updated_at = CURRENT_TIMESTAMP
            WHERE email = #{email} AND nonce = #{nonce} AND status = 'pending'
            """)
    int delivered(@Param("email") String email, @Param("nonce") String nonce, @Param("status") String status);

    @Update("""
            UPDATE email_verifications SET failed_attempts = failed_attempts + 1, updated_at = CURRENT_TIMESTAMP
            WHERE email = #{email}
            """)
    void failAttempt(String email);

    @Update("""
            UPDATE email_verifications SET status = 'consumed', code_digest = '', nonce = '', updated_at = CURRENT_TIMESTAMP
            WHERE email = #{email}
            """)
    void consume(String email);

    record Verification(String email, String codeDigest, String nonce, String status, Instant expiresAt,
            Instant nextSendAt, Instant windowStartedAt, int sendCount, int failedAttempts) {
        @Override public String toString() { return "Verification[redacted]"; }
    }
}
