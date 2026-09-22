package com.interview.copilot.mapper.background;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;

@Mapper
public interface HotwordSourceMapper {
    @Select("SELECT left(text, #{characters}) FROM reference_chunks WHERE app_users_id=#{user} "
            + "AND document_id=CAST(#{id} AS uuid) AND revision=#{revision} ORDER BY ordinal LIMIT 12")
    List<String> excerpts(@Param("user") long user, @Param("id") String id,
            @Param("revision") int revision, @Param("characters") int characters);
}
