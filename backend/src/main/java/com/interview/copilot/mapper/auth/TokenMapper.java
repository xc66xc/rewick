package com.interview.copilot.mapper.auth;

import com.interview.copilot.security.auth.UserPrincipal;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;

@Mapper
public interface TokenMapper {
    @Insert(
            "INSERT INTO auth_tokens(app_users_id, token_hash, expires_at) VALUES(#{userId},"
                    + " #{hash}, #{expiresAt})")
    void create(
            @Param("userId") long userId,
            @Param("hash") String hash,
            @Param("expiresAt") LocalDateTime expiresAt);

    @Select(
            """
SELECT u.id, u.display_name, u.role,
    (SELECT identifier FROM auth_identities WHERE app_users_id = u.id AND identity_type = 'email') AS email
FROM auth_tokens t JOIN app_users u ON u.id = t.app_users_id
WHERE t.token_hash = #{hash} AND t.is_revoked = FALSE AND t.expires_at > #{now} AND u.is_enabled = TRUE
""")
    UserPrincipal authenticate(@Param("hash") String hash, @Param("now") LocalDateTime now);

    @Update(
            "UPDATE auth_tokens SET is_revoked = TRUE, updated_at = LOCALTIMESTAMP(6) WHERE"
                    + " token_hash = #{hash}")
    void revoke(String hash);

    @Update(
            "UPDATE auth_tokens SET is_revoked = TRUE, updated_at = LOCALTIMESTAMP(6) WHERE"
                    + " app_users_id = #{userId} AND is_revoked = FALSE")
    void revokeAll(long userId);
}
