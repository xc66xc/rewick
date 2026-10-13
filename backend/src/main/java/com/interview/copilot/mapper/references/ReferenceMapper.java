package com.interview.copilot.mapper.references;

import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.entity.references.ReferenceDocumentEntity;
import com.interview.copilot.entity.references.ReferenceTotals;
import com.interview.copilot.model.references.ReferenceModels;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface ReferenceMapper {
    @Select(
            value =
                    "SELECT id::text,name,kind,is_enabled AS"
                        + " enabled,status,content_hash,revision,to_char(created_at,"
                        + " 'YYYY-MM-DD\"T\"HH24:MI:SS.US') || '+08:00' AS"
                        + " created_at,to_char(updated_at, 'YYYY-MM-DD\"T\"HH24:MI:SS.US') ||"
                        + " '+08:00' AS updated_at,error,chunk_count,context_count,section_count,format,heading_mode,splitter_version,index_status,index_error FROM reference_documents WHERE"
                        + " app_users_id=#{user} ORDER BY created_at DESC")
    List<ReferenceDocumentEntity> list(@Param("user") long user);

    @Select(
            value =
                    "SELECT id::text,name,kind,is_enabled AS"
                        + " enabled,status,content_hash,revision,to_char(created_at,"
                        + " 'YYYY-MM-DD\"T\"HH24:MI:SS.US') || '+08:00' AS"
                        + " created_at,to_char(updated_at, 'YYYY-MM-DD\"T\"HH24:MI:SS.US') ||"
                        + " '+08:00' AS updated_at,error,chunk_count,context_count,section_count,format,heading_mode,splitter_version,index_status,index_error FROM reference_documents WHERE"
                        + " app_users_id=#{user} AND id=CAST(#{id} AS uuid)")
    ReferenceDocumentEntity find(@Param("user") long user, @Param("id") String id);

    @Select("""
        <script>SELECT count(*) FROM reference_documents WHERE app_users_id=#{user} AND id IN
        <foreach collection="ids" item="id" open="(" close=")" separator=",">CAST(#{id} AS uuid)</foreach></script>
        """)
    long countOwned(@Param("user") long user, @Param("ids") List<String> ids);

    @Select(value = "SELECT id FROM app_users WHERE id=#{user} FOR UPDATE")
    Long lockUser(@Param("user") long user);

    @Select(value = "SELECT max_files,max_total_bytes,max_chunks,child_target,child_overlap,parent_target,bm25_k1,bm25_b,vector_min_score,rrf_constant,bm25_timeout_ms,max_term_rows,cache_enabled,cache_weight_bytes,version,hybrid_enabled FROM reference_policy WHERE id=1")
    ReferencePolicy policy();

    @Select(
            value =
                    "SELECT count(*) AS files,COALESCE(sum(file_size),0)::bigint AS bytes FROM"
                            + " reference_documents WHERE app_users_id=#{user}")
    ReferenceTotals totals(@Param("user") long user);

    @Insert(
            value =
                    "INSERT INTO reference_documents(id,app_users_id,name,content_hash,file_size)"
                            + " VALUES(CAST(#{id} AS uuid),#{user},#{name},#{hash},#{size})")
    void insert(
            @Param("user") long user,
            @Param("id") String id,
            @Param("name") String name,
            @Param("hash") String hash,
            @Param("size") long size);

    @Insert(
            value =
                    "INSERT INTO reference_index_jobs(document_id,app_users_id,revision,policy_json)"
                            + " SELECT CAST(#{id} AS uuid),#{user},#{revision},to_jsonb(p)-'updated_at'-'id' FROM reference_policy p WHERE p.id=1")
    void enqueue(@Param("user") long user, @Param("id") String id, @Param("revision") int revision);

    @Select(
            value =
                    "UPDATE reference_documents SET"
                        + " desired_revision=desired_revision+1,status=CASE WHEN splitter_version=1 AND revision>0 THEN 'ready' ELSE 'pending' END,index_status='pending',index_error='',error='',updated_at=LOCALTIMESTAMP(6)"
                        + " WHERE id=CAST(#{id} AS uuid) AND app_users_id=#{user} RETURNING"
                        + " desired_revision",
            affectData = true)
    int nextRevision(@Param("user") long user, @Param("id") String id);

    @Update(
            value =
                    "UPDATE reference_index_jobs SET status='cancelled',lease_token=NULL WHERE"
                            + " document_id=CAST(#{id} AS uuid)")
    void cancel(@Param("id") String id);

    @Update(
            value =
                    "UPDATE reference_documents SET"
                        + " is_enabled=COALESCE(#{enabled,jdbcType=BOOLEAN},is_enabled),kind=COALESCE(#{kind,jdbcType=VARCHAR},kind),updated_at=LOCALTIMESTAMP(6)"
                        + " WHERE id=CAST(#{id} AS uuid) AND app_users_id=#{user}")
    void update(
            @Param("user") long user,
            @Param("id") String id,
            @Param("enabled") Boolean enabled,
            @Param("kind") String kind);

    @Delete(
            value =
                    "DELETE FROM reference_documents WHERE id=CAST(#{id} AS uuid) AND"
                            + " app_users_id=#{user}")
    void delete(@Param("user") long user, @Param("id") String id);

    @Select(
            value =
                    "SELECT CASE WHEN heading_level>0 THEN repeat('#',heading_level)||' '||title||E'\\n\\n' ELSE '' END||introduction AS text FROM reference_sections WHERE document_id=CAST(#{id} AS uuid) AND"
                            + " app_users_id=#{user} AND revision=#{revision} ORDER BY ordinal")
    List<String> preview(
            @Param("user") long user, @Param("id") String id, @Param("revision") int revision);

    @Select(
            value =
                    "UPDATE reference_index_jobs SET status='running',lease_token=CAST(#{token} AS"
                        + " uuid),lease_until=LOCALTIMESTAMP(6)+INTERVAL '90"
                        + " seconds',attempts=attempts+1,updated_at=LOCALTIMESTAMP(6) WHERE"
                        + " id=(SELECT id FROM reference_index_jobs WHERE status='pending' OR"
                        + " (status='running' AND lease_until<LOCALTIMESTAMP(6)) ORDER BY id FOR"
                        + " UPDATE SKIP LOCKED LIMIT 1) RETURNING id,document_id::text,app_users_id"
                        + " AS user_id,revision,lease_token::text AS token,policy_json::text AS policy_json",
            affectData = true)
    ReferenceModels.Job claim(@Param("token") String token);

    @Update(
            value =
                    "UPDATE reference_index_jobs SET lease_until=LOCALTIMESTAMP(6)+INTERVAL '90"
                        + " seconds' WHERE id=#{job.id} AND lease_token=CAST(#{job.token} AS uuid)"
                        + " AND status='running'")
    int renew(@Param("job") ReferenceModels.Job job);

    @Update(
            value =
                    "UPDATE reference_documents SET status=CASE WHEN splitter_version=1 AND revision>0 THEN 'ready' ELSE 'indexing' END,index_status='indexing',updated_at=LOCALTIMESTAMP(6)"
                            + " WHERE id=CAST(#{job.documentId} AS uuid) AND"
                            + " desired_revision=#{job.revision}")
    void indexing(@Param("job") ReferenceModels.Job job);

    @Select(
            value =
                    "SELECT desired_revision FROM reference_documents WHERE"
                        + " id=CAST(#{job.documentId} AS uuid) AND app_users_id=#{job.userId} FOR"
                        + " UPDATE")
    Integer desiredRevision(@Param("job") ReferenceModels.Job job);

    @Select(
            value =
                    "SELECT COALESCE(sum(chunk_count),0)::bigint FROM reference_documents WHERE"
                            + " app_users_id=#{job.userId} AND id<>CAST(#{job.documentId} AS uuid)")
    long otherChunks(@Param("job") ReferenceModels.Job job);

    @Update(
            value =
                    "UPDATE reference_index_jobs SET"
                        + " status='complete',embedded_chunks=#{count},lease_until=NULL,updated_at=LOCALTIMESTAMP(6)"
                        + " WHERE id=#{job.id}")
    void complete(@Param("job") ReferenceModels.Job job, @Param("count") int count);

    @Insert(
            value =
                    "INSERT INTO reference_embeddings(chunk_id,app_users_id,fingerprint,embedding)"
                            + " VALUES(#{id},#{user},#{fingerprint},CAST(#{vector} AS vector))")
    void insertEmbedding(
            @Param("id") long id,
            @Param("user") long user,
            @Param("fingerprint") String fingerprint,
            @Param("vector") String vector);

    @Update(
            value =
                    "UPDATE reference_index_jobs SET"
                        + " status='failed',error=#{error},lease_until=NULL,updated_at=LOCALTIMESTAMP(6)"
                        + " WHERE id=#{job.id}")
    void failJob(@Param("job") ReferenceModels.Job job, @Param("error") String error);

    @Update(
            value =
                    "UPDATE reference_documents SET"
                            + " status=CASE WHEN splitter_version=1 AND revision>0 THEN 'ready' ELSE 'error' END,index_status='error',index_error=#{error},error=#{error},updated_at=LOCALTIMESTAMP(6) WHERE"
                            + " id=CAST(#{job.documentId} AS uuid) AND"
                            + " desired_revision=#{job.revision}")
    void failDocument(@Param("job") ReferenceModels.Job job, @Param("error") String error);

    @Update("UPDATE reference_policy SET max_files=#{policy.maxFiles},max_total_bytes=#{policy.maxTotalBytes},max_chunks=#{policy.maxChunks},child_target=#{policy.childTarget},child_overlap=#{policy.childOverlap},parent_target=#{policy.parentTarget},bm25_k1=#{policy.bm25K1},bm25_b=#{policy.bm25B},vector_min_score=#{policy.vectorMinScore},rrf_constant=#{policy.rrfConstant},bm25_timeout_ms=#{policy.bm25TimeoutMs},max_term_rows=#{policy.maxTermRows},cache_enabled=#{policy.cacheEnabled},cache_weight_bytes=#{policy.cacheWeightBytes},hybrid_enabled=#{policy.hybridEnabled},version=version+1,updated_at=LOCALTIMESTAMP(6) WHERE id=1 AND version=#{policy.version}")
    int updatePolicy(@Param("policy") ReferencePolicy policy);

}
