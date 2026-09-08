package com.interview.copilot.auth;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface UserMapper extends BaseMapper<UserEntity> {
    @Select("SELECT id, username, password_hash, is_enabled AS enabled FROM app_users WHERE username = #{username}")
    UserEntity findByUsername(String username);

    @Insert("INSERT INTO app_users(username, password_hash) VALUES(#{username}, #{passwordHash}) ON CONFLICT(username) DO NOTHING")
    int createBootstrap(@Param("username") String username, @Param("passwordHash") String passwordHash);
}
