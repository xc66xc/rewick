package com.interview.copilot.mapper.history;

import com.interview.copilot.entity.history.SessionRecordEntity;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface SessionRecordMapper {
    String USED_SECONDS =
            "(SELECT used_seconds FROM interview_sessions WHERE id=session_records.interview_sessions_id"
                    + " AND app_users_id=session_records.app_users_id)";
    String COLUMNS =
            "id,record_id,version,mutation_id::text,(content || jsonb_build_object('usedSeconds',"
                    + USED_SECONDS
                    + "))::text AS content,deleted_at IS NOT NULL AS"
                + " deleted";

    @Select(
            "SELECT "
                    + COLUMNS
                    + " FROM session_records WHERE app_users_id=#{user} AND record_id=#{record}")
    SessionRecordEntity find(@Param("user") long user, @Param("record") String record);

    @Select(
            "SELECT"
                + " id,record_id,version,mutation_id::text,jsonb_build_object('id',record_id,'title',title,'createdAt',content->'createdAt','segments','[]'::jsonb,'answers','[]'::jsonb,'segmentCount',jsonb_array_length(content->'segments'),'answerCount',jsonb_array_length(content->'answers'),'interviewEnvironment',content->'interviewEnvironment','usedSeconds',"
                + USED_SECONDS
                + ")::text"
                + " AS content,false AS deleted FROM session_records WHERE app_users_id=#{user} AND"
                + " deleted_at IS NULL AND id < #{cursor} ORDER BY id DESC LIMIT 21")
    List<SessionRecordEntity> page(@Param("user") long user, @Param("cursor") long cursor);

    @Insert(
            "INSERT INTO"
                + " session_records(app_users_id,record_id,title,started_at,content,mutation_id,interview_sessions_id)"
                + " VALUES(#{user},#{record},#{title},#{started},CAST(#{content} AS"
                + " jsonb),CAST(#{mutation} AS uuid),(SELECT id FROM interview_sessions WHERE"
                + " app_users_id=#{user} AND session_id=#{session}))")
    void insert(
            @Param("user") long user,
            @Param("record") String record,
            @Param("title") String title,
            @Param("started") LocalDateTime started,
            @Param("content") String content,
            @Param("mutation") String mutation,
            @Param("session") String session);

    @Update(
            "UPDATE session_records SET content=CAST(#{content} AS"
                + " jsonb),title=#{title},version=version+1,mutation_id=CAST(#{mutation} AS"
                + " uuid),updated_at=LOCALTIMESTAMP WHERE app_users_id=#{user} AND"
                + " record_id=#{record} AND deleted_at IS NULL")
    void update(
            @Param("user") long user,
            @Param("record") String record,
            @Param("title") String title,
            @Param("content") String content,
            @Param("mutation") String mutation);

    @Update(
            "UPDATE session_records SET"
                + " deleted_at=LOCALTIMESTAMP,updated_at=LOCALTIMESTAMP,content='{}'::jsonb,title='已删除',version=version+1"
                + " WHERE app_users_id=#{user} AND record_id=#{record} AND deleted_at IS NULL")
    void delete(@Param("user") long user, @Param("record") String record);
}
