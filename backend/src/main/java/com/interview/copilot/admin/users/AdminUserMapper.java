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

    @Select("SELECT id, username, role, is_enabled AS enabled FROM app_users WHERE id = #{id} FOR UPDATE")
    Account lockAccount(long id);

    @Select("SELECT COUNT(id) FROM app_users WHERE role = 'ADMIN' AND is_enabled = TRUE")
    int enabledAdministrators();

    @Select("SELECT COUNT(id) FROM app_users WHERE #{query} = '' OR strpos(lower(username), lower(#{query})) > 0")
    long count(String query);

    @Select("""
            SELECT id::text, username, role, is_enabled AS enabled,
                COALESCE(daily_answers, #{defaultAnswers}) AS daily_answers,
                COALESCE(daily_knowledge_queries, #{defaultKnowledge}) AS daily_knowledge_queries, created_at
            FROM app_users WHERE #{query} = '' OR strpos(lower(username), lower(#{query})) > 0
            ORDER BY id DESC LIMIT #{size} OFFSET #{offset}
            """)
    List<UserView> page(@Param("query") String query, @Param("size") int size, @Param("offset") int offset,
            @Param("defaultAnswers") int defaultAnswers, @Param("defaultKnowledge") int defaultKnowledge);

    @Select("""
            SELECT id::text, username, role, is_enabled AS enabled,
                COALESCE(daily_answers, #{defaultAnswers}) AS daily_answers,
                COALESCE(daily_knowledge_queries, #{defaultKnowledge}) AS daily_knowledge_queries, created_at
            FROM app_users WHERE id = #{id}
            """)
    UserView view(@Param("id") long id, @Param("defaultAnswers") int defaultAnswers, @Param("defaultKnowledge") int defaultKnowledge);

    @Insert("""
            INSERT INTO app_users(username, password_hash, role, daily_answers, daily_knowledge_queries)
            VALUES(#{username}, #{passwordHash}, 'USER', #{dailyAnswers}, #{dailyKnowledgeQueries})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id", keyColumn = "id")
    void create(UserEntity user);

    @Update("""
            UPDATE app_users SET is_enabled = #{enabled}, daily_answers = #{answers},
                daily_knowledge_queries = #{knowledge}, updated_at = CURRENT_TIMESTAMP WHERE id = #{id}
            """)
    void update(@Param("id") long id, @Param("enabled") boolean enabled,
            @Param("answers") int answers, @Param("knowledge") int knowledge);

    @Update("UPDATE app_users SET password_hash = #{hash}, updated_at = CURRENT_TIMESTAMP WHERE id = #{id}")
    void resetPassword(@Param("id") long id, @Param("hash") String hash);

    record Account(long id, String username, String role, boolean enabled) {}
}
