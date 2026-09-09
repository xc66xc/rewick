package com.interview.copilot.auth;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface UserMapper extends BaseMapper<UserEntity> {
    @Select("SELECT u.id, u.display_name, u.password_hash, u.role, u.is_enabled AS enabled FROM app_users u JOIN auth_identities i ON i.app_users_id=u.id WHERE i.identity_type='account' AND i.identifier=#{identifier}")
    UserEntity findByIdentifier(String identifier);

    @Select("""
            SELECT u.id, u.display_name, u.password_hash, u.role, u.is_enabled AS enabled,
                (SELECT identifier FROM auth_identities WHERE app_users_id = u.id AND identity_type = 'email') AS email
            FROM app_users u JOIN auth_identities i ON i.app_users_id=u.id
            WHERE i.identity_type='account' AND i.identifier=#{identifier} FOR UPDATE OF u
            """)
    UserEntity findForLogin(String identifier);

    @Select("""
            SELECT u.id, u.display_name, u.password_hash, u.role, u.is_enabled AS enabled, i.identifier AS email
            FROM app_users u JOIN auth_identities i ON i.app_users_id = u.id
            WHERE i.identity_type = 'email' AND i.identifier = #{email} FOR UPDATE OF u
            """)
    UserEntity findForEmailLogin(String email);

    @Insert("INSERT INTO app_users(display_name, password_hash, role) VALUES(#{displayName}, #{passwordHash}, 'USER')")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void createEmailUser(UserEntity user);

    @Select("SELECT 1 FROM pg_advisory_xact_lock(1649911918)")
    int lockIdentityChanges();

    @Insert("""
            WITH created AS (
                INSERT INTO app_users(display_name, password_hash, role)
                VALUES(#{identifier}, #{passwordHash}, 'USER') RETURNING id
            ) INSERT INTO auth_identities(app_users_id, identity_type, identifier, verified_at)
              SELECT id, 'account', #{identifier}, CURRENT_TIMESTAMP FROM created
            """)
    int createBootstrap(@Param("identifier") String identifier, @Param("passwordHash") String passwordHash);

    @Insert("""
            WITH created AS (
                INSERT INTO app_users(display_name, password_hash, role)
                VALUES(#{identifier}, #{passwordHash}, 'ADMIN') RETURNING id
            ) INSERT INTO auth_identities(app_users_id, identity_type, identifier, verified_at)
              SELECT id, 'account', #{identifier}, CURRENT_TIMESTAMP FROM created
            """)
    int createAdminBootstrap(@Param("identifier") String identifier, @Param("passwordHash") String passwordHash);
}
