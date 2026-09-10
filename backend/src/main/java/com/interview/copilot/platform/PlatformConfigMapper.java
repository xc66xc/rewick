package com.interview.copilot.platform;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface PlatformConfigMapper {
    @Select("SELECT version, is_published AS published, payload::text AS payload FROM platform_config WHERE id = 1")
    Row read();

    @Update("""
            UPDATE platform_config SET version = version + 1, is_published = TRUE,
                payload = CAST(#{payload} AS jsonb), updated_at = LOCALTIMESTAMP(6)
            WHERE id = 1 AND version = #{version}
            """)
    int publish(@Param("version") long version, @Param("payload") String payload);

    record Row(long version, boolean published, String payload) {
        @Override public String toString() { return "PlatformConfigRow[version=" + version + "]"; }
    }
}
