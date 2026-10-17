package com.interview.copilot.mapper.mockinterview;

import com.interview.copilot.entity.mockinterview.MockConfigEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface MockConfigMapper {
 @Select("SELECT id FROM app_users WHERE id=#{actor} AND role='ADMIN' FOR UPDATE") Long lockActor(long actor);
 @Select("SELECT version,payload::text,tts_key FROM mock_interview_config WHERE id=1")
 MockConfigEntity get();
 @Update("UPDATE mock_interview_config SET payload=CAST(#{payload} AS jsonb),tts_key=#{key},version=version+1,updated_at=LOCALTIMESTAMP(6) WHERE id=1 AND version=#{version}")
 int save(@Param("version") long version,@Param("payload") String payload,@Param("key") String key);
}
