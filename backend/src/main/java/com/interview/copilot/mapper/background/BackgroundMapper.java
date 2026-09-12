package com.interview.copilot.mapper.background;

import com.interview.copilot.entity.background.BackgroundEntity;
import com.interview.copilot.model.background.BackgroundKind;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface BackgroundMapper {
    String COLUMNS =
            "id::text, content::text, version, mutation_id::text, is_deleted AS deleted,"
                + " created_at, updated_at";

    @Select(
            "SELECT "
                    + COLUMNS
                    + " FROM ${kind.table} WHERE app_users_id=#{user} AND NOT is_deleted ORDER BY"
                    + " created_at,id")
    List<BackgroundEntity> list(@Param("user") long user, @Param("kind") BackgroundKind kind);

    @Select(
            "SELECT "
                    + COLUMNS
                    + " FROM ${kind.table} WHERE app_users_id=#{user} AND id=CAST(#{id} AS uuid)")
    BackgroundEntity find(
            @Param("user") long user, @Param("kind") BackgroundKind kind, @Param("id") String id);

    @Insert(
            "INSERT INTO ${kind.table}(id,app_users_id,content,mutation_id) VALUES(CAST(#{id} AS"
                + " uuid),#{user},CAST(#{content} AS jsonb),CAST(#{mutation} AS uuid))")
    void insert(
            @Param("user") long user,
            @Param("kind") BackgroundKind kind,
            @Param("id") String id,
            @Param("content") String content,
            @Param("mutation") String mutation);

    @Update(
            "UPDATE ${kind.table} SET content=CAST(#{content} AS"
                + " jsonb),mutation_id=CAST(#{mutation} AS"
                + " uuid),version=version+1,updated_at=LOCALTIMESTAMP(6) WHERE app_users_id=#{user}"
                + " AND id=CAST(#{id} AS uuid)")
    void update(
            @Param("user") long user,
            @Param("kind") BackgroundKind kind,
            @Param("id") String id,
            @Param("content") String content,
            @Param("mutation") String mutation);

    @Update(
            "UPDATE ${kind.table} SET"
                + " is_deleted=TRUE,content='{}'::jsonb,version=version+1,updated_at=LOCALTIMESTAMP(6)"
                + " WHERE app_users_id=#{user} AND id=CAST(#{id} AS uuid)")
    void delete(
            @Param("user") long user, @Param("kind") BackgroundKind kind, @Param("id") String id);

    @Select("SELECT environment_id::text FROM interview_preferences WHERE app_users_id=#{user}")
    String active(long user);

    @Insert(
            "INSERT INTO interview_preferences(app_users_id,environment_id)"
                + " VALUES(#{user},CAST(#{id} AS uuid)) ON CONFLICT(app_users_id) DO UPDATE SET"
                + " environment_id=EXCLUDED.environment_id")
    void activate(@Param("user") long user, @Param("id") String id);

    @Select(
            "SELECT EXISTS(SELECT 1 FROM reference_documents WHERE app_users_id=#{user} AND"
                + " id=CAST(#{id} AS uuid) AND (NOT #{ready} OR (status='ready' AND is_enabled)))")
    boolean reference(
            @Param("user") long user, @Param("id") String id, @Param("ready") boolean ready);

    @Delete(
            "DELETE FROM environment_references WHERE app_users_id=#{user} AND"
                + " environment_id=CAST(#{id} AS uuid)")
    void clearReferences(@Param("user") long user, @Param("id") String id);

    @Insert(
            "INSERT INTO environment_references(environment_id,document_id,app_users_id)"
                + " VALUES(CAST(#{environment} AS uuid),CAST(#{document} AS uuid),#{user})")
    void addReference(
            @Param("user") long user,
            @Param("environment") String environment,
            @Param("document") String document);

    @Select(
            "SELECT background_snapshot::text FROM interview_sessions WHERE app_users_id=#{user}"
                + " AND session_id=#{id}")
    String snapshot(@Param("user") long user, @Param("id") String id);

    @Update(
            "UPDATE interview_sessions SET background_snapshot=CAST(#{content} AS jsonb) WHERE"
                + " app_users_id=#{user} AND session_id=#{id} AND background_snapshot IS NULL")
    void freeze(@Param("user") long user, @Param("id") String id, @Param("content") String content);
}
