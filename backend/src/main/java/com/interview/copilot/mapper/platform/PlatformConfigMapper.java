package com.interview.copilot.mapper.platform;

import com.interview.copilot.entity.platform.PlatformConfigRow;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface PlatformConfigMapper {
    @Select("SELECT id FROM platform_config WHERE id=1 FOR UPDATE")
    Long lock();

    @Select(
            "SELECT"
                + " version,llm_model_id,temperature,asr_service_id,retrieval_mode,knowledge_service_id"
                + " FROM desktop_settings WHERE id=1")
    com.interview.copilot.entity.platform.DesktopSettingsEntity desktopDefaults();

    @Select(
            "SELECT version, is_published AS published, payload::text AS payload FROM"
                    + " platform_config WHERE id = 1")
    PlatformConfigRow read();

    @Update(
            """
            UPDATE platform_config SET version = version + 1, is_published = TRUE,
                payload = CAST(#{payload} AS jsonb), updated_at = LOCALTIMESTAMP(6)
            WHERE id = 1 AND version = #{version}
            """)
    int publish(@Param("version") long version, @Param("payload") String payload);
}
