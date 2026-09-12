package com.interview.copilot.mapper.preferences;

import com.interview.copilot.entity.preferences.PreferencesEntity;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface PreferencesMapper {
    @Insert(
            "INSERT INTO user_preferences(app_users_id) VALUES(#{user}) ON CONFLICT(app_users_id)"
                + " DO NOTHING")
    void ensure(long user);

    @Select(
            "SELECT version,payload::text,mutation_id::text FROM user_preferences WHERE"
                + " app_users_id=#{user}")
    PreferencesEntity get(long user);

    @Update(
            "UPDATE user_preferences SET payload=CAST(#{payload} AS"
                + " jsonb),version=version+1,mutation_id=CAST(#{mutation} AS"
                + " uuid),updated_at=LOCALTIMESTAMP(6) WHERE app_users_id=#{user}")
    void save(
            @Param("user") long user,
            @Param("payload") String payload,
            @Param("mutation") String mutation);
}
