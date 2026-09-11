package com.interview.copilot.admin.users;

import com.interview.copilot.auth.UserEntity;
import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface AdminUserMapper {
    // Serialize administrator mutations before taking account locks, including cross-admin disabling.
    @Select("SELECT 1 FROM pg_advisory_xact_lock(1649911917)")
    int lockChanges();

    @Select("SELECT id, display_name, role, is_enabled AS enabled FROM app_users WHERE id = #{id} FOR UPDATE")
    Account lockAccount(long id);

    @Select("SELECT COUNT(id) FROM app_users WHERE role = 'ADMIN' AND is_enabled = TRUE")
    int enabledAdministrators();

    @Select("SELECT COUNT(id) FROM app_users WHERE #{query} = '' OR (strpos(lower(display_name), lower(#{query})) > 0 OR EXISTS(SELECT 1 FROM auth_identities i WHERE i.app_users_id=app_users.id AND i.identity_type='email' AND strpos(lower(i.identifier), lower(#{query})) > 0))")
    long count(String query);

    @Select("""
            SELECT id::text, display_name, role, is_enabled AS enabled,
                COALESCE((SELECT available_seconds FROM time_wallets w WHERE w.app_users_id=app_users.id),0) AS available_seconds,
                COALESCE((SELECT version FROM time_wallets w WHERE w.app_users_id=app_users.id),0) AS wallet_version,
                created_at AT TIME ZONE 'Asia/Shanghai' AS created_at
            FROM app_users WHERE #{query} = '' OR (strpos(lower(display_name), lower(#{query})) > 0 OR EXISTS(SELECT 1 FROM auth_identities i WHERE i.app_users_id=app_users.id AND i.identity_type='email' AND strpos(lower(i.identifier), lower(#{query})) > 0))
            ORDER BY id DESC LIMIT #{size} OFFSET #{offset}
            """)
    List<UserView> page(@Param("query") String query, @Param("size") int size, @Param("offset") int offset);

    @Select("""
            SELECT id::text, display_name, role, is_enabled AS enabled,
                COALESCE((SELECT available_seconds FROM time_wallets w WHERE w.app_users_id=app_users.id),0) AS available_seconds,
                COALESCE((SELECT version FROM time_wallets w WHERE w.app_users_id=app_users.id),0) AS wallet_version,
                created_at AT TIME ZONE 'Asia/Shanghai' AS created_at
            FROM app_users WHERE id = #{id}
            """)
    UserView view(@Param("id") long id);

    @Insert("""
            INSERT INTO app_users(display_name, password_hash, role)
            VALUES(#{displayName}, #{passwordHash}, 'USER')
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id", keyColumn = "id")
    void create(UserEntity user);

    @Insert("INSERT INTO auth_identities(app_users_id, identity_type, identifier, verified_at) VALUES(#{id}, 'account', #{identifier}, LOCALTIMESTAMP(6))")
    void createAccountIdentity(@Param("id") long id, @Param("identifier") String identifier);

    @Update("""
            UPDATE app_users SET is_enabled = #{enabled}, updated_at = LOCALTIMESTAMP(6) WHERE id = #{id}
            """)
    void update(@Param("id") long id, @Param("enabled") boolean enabled);

    @Update("UPDATE app_users SET password_hash = #{hash}, updated_at = LOCALTIMESTAMP(6) WHERE id = #{id}")
    void resetPassword(@Param("id") long id, @Param("hash") String hash);

    record Account(long id, String displayName, String role, boolean enabled) {}
}
