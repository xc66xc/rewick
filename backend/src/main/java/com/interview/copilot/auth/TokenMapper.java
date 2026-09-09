package com.interview.copilot.auth;

import java.time.Instant;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface TokenMapper {
    @Insert("INSERT INTO auth_tokens(app_users_id, token_hash, expires_at) VALUES(#{userId}, #{hash}, #{expiresAt})")
    void create(@Param("userId") long userId, @Param("hash") String hash, @Param("expiresAt") Instant expiresAt);

    @Select("""
            SELECT u.id, u.username, u.role,
                (SELECT identifier FROM auth_identities WHERE app_users_id = u.id AND identity_type = 'email') AS email
            FROM auth_tokens t JOIN app_users u ON u.id = t.app_users_id
            WHERE t.token_hash = #{hash} AND t.is_revoked = FALSE AND t.expires_at > #{now} AND u.is_enabled = TRUE
            """)
    UserPrincipal authenticate(@Param("hash") String hash, @Param("now") Instant now);

    @Update("UPDATE auth_tokens SET is_revoked = TRUE, updated_at = CURRENT_TIMESTAMP WHERE token_hash = #{hash}")
    void revoke(String hash);

    @Update("UPDATE auth_tokens SET is_revoked = TRUE, updated_at = CURRENT_TIMESTAMP WHERE app_users_id = #{userId} AND is_revoked = FALSE")
    void revokeAll(long userId);
}
