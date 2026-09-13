package com.interview.copilot.mapper.auth;

import com.interview.copilot.entity.auth.AuthenticatedUserEntity;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;

@Mapper
public interface TokenMapper {
    String COLUMNS =
            "SELECT u.id,u.display_name,u.role,(SELECT identifier FROM auth_identities WHERE"
                + " app_users_id=u.id AND identity_type='email') AS email,t.id AS"
                + " token_id,t.client_type,t.is_revoked AS revoked,t.revoked_reason,u.is_enabled AS"
                + " enabled,t.expires_at FROM auth_tokens t JOIN app_users u ON u.id=t.app_users_id"
                + " ";

    @Select("SELECT id FROM app_users WHERE id=#{userId} FOR UPDATE")
    Long lockUser(long userId);

    @Select(
            "SELECT EXISTS(SELECT 1 FROM interview_sessions WHERE app_users_id=#{userId} AND"
                + " status='active')")
    boolean hasActiveInterview(long userId);

    @Select("SELECT clock_timestamp() AT TIME ZONE 'Asia/Shanghai'")
    LocalDateTime now();

    @Insert(
            "INSERT INTO auth_tokens(app_users_id,token_hash,expires_at,client_type)"
                + " VALUES(#{userId},#{hash},#{expiresAt},#{clientType})")
    void create(
            @Param("userId") long userId,
            @Param("hash") String hash,
            @Param("expiresAt") LocalDateTime expiresAt,
            @Param("clientType") String clientType);

    @Select(COLUMNS + " WHERE t.token_hash=#{hash}")
    AuthenticatedUserEntity authenticate(String hash);

    @Select(COLUMNS + " WHERE t.id=#{id}")
    AuthenticatedUserEntity byId(long id);

    @Update(
            "UPDATE auth_tokens SET"
                + " is_revoked=TRUE,revoked_reason='session_expired',revoked_at=LOCALTIMESTAMP(6),updated_at=LOCALTIMESTAMP(6)"
                + " WHERE token_hash=#{hash} AND NOT is_revoked")
    void revoke(String hash);

    @Update(
            "UPDATE auth_tokens SET"
                + " is_revoked=TRUE,revoked_reason='session_expired',revoked_at=LOCALTIMESTAMP(6),updated_at=LOCALTIMESTAMP(6)"
                + " WHERE app_users_id=#{userId} AND NOT is_revoked")
    void revokeAll(long userId);

    @Update(
            "UPDATE auth_tokens SET"
                + " is_revoked=TRUE,revoked_reason='session_replaced',revoked_at=LOCALTIMESTAMP(6),updated_at=LOCALTIMESTAMP(6)"
                + " WHERE app_users_id=#{userId} AND client_type='desktop' AND NOT is_revoked")
    void replaceDesktop(long userId);
}
