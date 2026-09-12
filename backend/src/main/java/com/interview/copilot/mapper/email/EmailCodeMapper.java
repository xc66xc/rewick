package com.interview.copilot.mapper.email;

import com.interview.copilot.entity.email.EmailCodeDigest;
import com.interview.copilot.entity.email.EmailVerificationEntity;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;

@Mapper
public interface EmailCodeMapper {
    @Insert(
            """
            INSERT INTO email_verifications(email, purpose, next_send_at, window_started_at)
            VALUES(#{email}, #{purpose}, #{now}, #{now}) ON CONFLICT(email, purpose) DO NOTHING
            """)
    void ensure(
            @Param("email") String email,
            @Param("purpose") String purpose,
            @Param("now") LocalDateTime now);

    @Select(
            """
SELECT email, code_digest, nonce, status, expires_at, next_send_at, window_started_at, send_count, failed_attempts
FROM email_verifications WHERE email = #{email} AND purpose = #{purpose} FOR UPDATE
""")
    EmailVerificationEntity lock(@Param("email") String email, @Param("purpose") String purpose);

    @Update(
            """
UPDATE email_verifications SET code_digest = #{code.digest}, nonce = #{code.nonce}, status = 'pending',
    expires_at = #{expires}, next_send_at = #{next}, window_started_at = #{window}, send_count = #{count},
    failed_attempts = 0, updated_at = LOCALTIMESTAMP(6) WHERE email = #{email} AND purpose = #{purpose}
""")
    void reserve(
            @Param("email") String email,
            @Param("purpose") String purpose,
            @Param("code") EmailCodeDigest code,
            @Param("expires") LocalDateTime expires,
            @Param("next") LocalDateTime next,
            @Param("window") LocalDateTime window,
            @Param("count") int count);

    @Update(
            """
UPDATE email_verifications SET status = #{status}, updated_at = LOCALTIMESTAMP(6)
WHERE email = #{email} AND purpose = #{purpose} AND nonce = #{nonce} AND status = 'pending'
""")
    int delivered(
            @Param("email") String email,
            @Param("purpose") String purpose,
            @Param("nonce") String nonce,
            @Param("status") String status);

    @Update(
            """
UPDATE email_verifications SET failed_attempts = failed_attempts + 1, updated_at = LOCALTIMESTAMP(6)
WHERE email = #{email} AND purpose = #{purpose}
""")
    void failAttempt(@Param("email") String email, @Param("purpose") String purpose);

    @Update(
            """
UPDATE email_verifications SET status = 'consumed', code_digest = '', nonce = '', updated_at = LOCALTIMESTAMP(6)
WHERE email = #{email} AND purpose = #{purpose}
""")
    void consume(@Param("email") String email, @Param("purpose") String purpose);
}
