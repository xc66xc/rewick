package com.interview.copilot.mapper.platform;

import com.interview.copilot.entity.platform.DesktopSettingsEntity;
import com.interview.copilot.entity.platform.DesktopUserEntity;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * @author Carl Wang
 * @date 2026-09-13
 * @description 桌面高级设置权限与平台默认配置。
 */
@Mapper
public interface DesktopSettingsMapper {
    @Select(
            "SELECT version, llm_model_id, temperature, asr_service_id FROM desktop_settings WHERE id=1")
    DesktopSettingsEntity read();

    @Select("SELECT advanced_settings_enabled FROM app_users WHERE id=#{id}")
    Boolean permitted(long id);

    @Select(
            "SELECT u.id::text, u.display_name, (SELECT i.identifier FROM auth_identities i WHERE"
                    + " i.app_users_id=u.id AND i.identity_type='email' LIMIT 1) AS email FROM"
                    + " app_users u WHERE u.advanced_settings_enabled ORDER BY u.id DESC")
    List<DesktopUserEntity> users();

    @Update(
            "UPDATE app_users SET advanced_settings_enabled=#{enabled},"
                    + " updated_at=LOCALTIMESTAMP(6) WHERE id=#{id}")
    int permission(@Param("id") long id, @Param("enabled") boolean enabled);

    @Update("UPDATE user_preferences SET payload=jsonb_set(payload, '{webSearchEnabled}', 'false'::jsonb),"
            + " version=version+1,mutation_id=NULL,updated_at=LOCALTIMESTAMP(6) WHERE app_users_id=#{user}"
            + " AND payload->>'webSearchEnabled'='true'")
    void clearWebSearch(long user);

    @Update(
            "UPDATE desktop_settings SET"
                + " version=version+1,llm_model_id=#{llmModelId},temperature=#{temperature},asr_service_id=#{asrServiceId},updated_at=LOCALTIMESTAMP(6)"
                + " WHERE id=1 AND version=#{version}")
    int save(DesktopSettingsEntity input);
}
