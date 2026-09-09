package com.interview.copilot.auth.email;

import java.time.Instant;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface EmailIdentityMapper {
    @Select("""
            SELECT EXISTS(SELECT 1 FROM auth_identities WHERE identity_type = 'email' AND identifier = #{email})
                OR EXISTS(SELECT 1 FROM auth_identities WHERE identity_type = 'account' AND lower(identifier) = #{email})
            """)
    boolean exists(String email);

    @Insert("""
            INSERT INTO auth_identities(app_users_id, identity_type, identifier, verified_at)
            VALUES(#{userId}, 'email', #{email}, #{now})
            """)
    void create(@Param("userId") long userId, @Param("email") String email, @Param("now") Instant now);
}
