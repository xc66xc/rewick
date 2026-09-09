package com.interview.copilot.auth;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface UserMapper extends BaseMapper<UserEntity> {
    @Select("SELECT id, username, password_hash, role, is_enabled AS enabled FROM app_users WHERE username = #{username}")
    UserEntity findByUsername(String username);

    @Select("""
            SELECT u.id, u.username, u.password_hash, u.role, u.is_enabled AS enabled,
                (SELECT identifier FROM auth_identities WHERE app_users_id = u.id AND identity_type = 'email') AS email
            FROM app_users u WHERE u.username = #{username} FOR UPDATE OF u
            """)
    UserEntity findForLogin(String username);

    @Select("""
            SELECT u.id, u.username, u.password_hash, u.role, u.is_enabled AS enabled, i.identifier AS email
            FROM app_users u JOIN auth_identities i ON i.app_users_id = u.id
            WHERE i.identity_type = 'email' AND i.identifier = #{email} FOR UPDATE OF u
            """)
    UserEntity findForEmailLogin(String email);

    @Insert("INSERT INTO app_users(username, password_hash, role) VALUES(#{username}, #{passwordHash}, 'USER')")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void createEmailUser(UserEntity user);

    @Insert("INSERT INTO app_users(username, password_hash) VALUES(#{username}, #{passwordHash}) ON CONFLICT(username) DO NOTHING")
    int createBootstrap(@Param("username") String username, @Param("passwordHash") String passwordHash);

    @Insert("INSERT INTO app_users(username, password_hash, role) VALUES(#{username}, #{passwordHash}, 'ADMIN') ON CONFLICT(username) DO NOTHING")
    int createAdminBootstrap(@Param("username") String username, @Param("passwordHash") String passwordHash);
}
