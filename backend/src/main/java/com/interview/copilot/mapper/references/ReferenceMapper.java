package com.interview.copilot.mapper.references;

import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.model.references.ReferenceModels;
import com.interview.copilot.response.references.ReferenceDocumentResponse;
import com.interview.copilot.response.references.ReferenceExcerptResponse;

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
                        + " enabled,status,page_count,content_hash,revision,to_char(created_at,"
                        + " 'YYYY-MM-DD\"T\"HH24:MI:SS.US') || '+08:00' AS"
                        + " created_at,to_char(updated_at, 'YYYY-MM-DD\"T\"HH24:MI:SS.US') ||"
                        + " '+08:00' AS updated_at,error,chunk_count FROM reference_documents WHERE"
                        + " app_users_id=#{user} ORDER BY created_at DESC")
    List<ReferenceDocumentResponse> list(@Param("user") long user);

    @Select(
            value =
                    "SELECT id::text,name,kind,is_enabled AS"
                        + " enabled,status,page_count,content_hash,revision,to_char(created_at,"
                        + " 'YYYY-MM-DD\"T\"HH24:MI:SS.US') || '+08:00' AS"
                        + " created_at,to_char(updated_at, 'YYYY-MM-DD\"T\"HH24:MI:SS.US') ||"
                        + " '+08:00' AS updated_at,error,chunk_count FROM reference_documents WHERE"
                        + " app_users_id=#{user} AND id=CAST(#{id} AS uuid)")
    ReferenceDocumentResponse find(@Param("user") long user, @Param("id") String id);

    @Select(value = "SELECT id FROM app_users WHERE id=#{user} FOR UPDATE")
    Long lockUser(@Param("user") long user);

    @Select(value = "SELECT max_files,max_total_bytes,max_chunks FROM reference_policy WHERE id=1")
    ReferencePolicy policy();

    @Select(
            value =
                    "SELECT count(*) AS files,COALESCE(sum(file_size),0)::bigint AS bytes FROM"
                            + " reference_documents WHERE app_users_id=#{user}")
    Totals totals(@Param("user") long user);

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
                    "INSERT INTO reference_index_jobs(document_id,app_users_id,revision)"
                            + " VALUES(CAST(#{id} AS uuid),#{user},#{revision})")
    void enqueue(@Param("user") long user, @Param("id") String id, @Param("revision") int revision);

    @Select(
            value =
                    "UPDATE reference_documents SET"
                        + " desired_revision=desired_revision+1,status='pending',error='',updated_at=LOCALTIMESTAMP(6)"
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
                    "SELECT text FROM reference_chunks WHERE document_id=CAST(#{id} AS uuid) AND"
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
                        + " AS user_id,revision,lease_token::text AS token",
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
                    "UPDATE reference_documents SET status='indexing',updated_at=LOCALTIMESTAMP(6)"
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

    @Delete(value = "DELETE FROM reference_chunks WHERE document_id=CAST(#{id} AS uuid)")
    void deleteChunks(@Param("id") String id);

    @Update(
            value =
                    "UPDATE reference_documents SET"
                        + " revision=#{job.revision},status='ready',page_count=#{parsed.pageCount},chunk_count=#{count},error='',updated_at=LOCALTIMESTAMP(6)"
                        + " WHERE id=CAST(#{job.documentId} AS uuid)")
    void ready(
            @Param("job") ReferenceModels.Job job,
            @Param("parsed") ReferenceModels.Parsed parsed,
            @Param("count") int count);

    @Update(
            value =
                    "UPDATE reference_index_jobs SET"
                        + " status='complete',embedded_chunks=#{count},lease_until=NULL,updated_at=LOCALTIMESTAMP(6)"
                        + " WHERE id=#{job.id}")
    void complete(@Param("job") ReferenceModels.Job job, @Param("count") int count);

    @Select(
            value =
                    "INSERT INTO"
                        + " reference_chunks(document_id,app_users_id,revision,ordinal,text,page_start,page_end)"
                        + " VALUES(CAST(#{job.documentId} AS"
                        + " uuid),#{job.userId},#{job.revision},#{chunk.ordinal},#{chunk.text},#{chunk.pageStart},#{chunk.pageEnd})"
                        + " RETURNING id",
            affectData = true)
    long insertChunk(
            @Param("job") ReferenceModels.Job job, @Param("chunk") ReferenceModels.Chunk chunk);

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
                            + " status='error',error=#{error},updated_at=LOCALTIMESTAMP(6) WHERE"
                            + " id=CAST(#{job.documentId} AS uuid) AND"
                            + " desired_revision=#{job.revision}")
    void failDocument(@Param("job") ReferenceModels.Job job, @Param("error") String error);

    @Update(
            value =
                    "UPDATE reference_policy SET"
                        + " max_files=#{policy.maxFiles},max_total_bytes=#{policy.maxTotalBytes},max_chunks=#{policy.maxChunks},updated_at=LOCALTIMESTAMP(6)"
                        + " WHERE id=1")
    void updatePolicy(@Param("policy") ReferencePolicy policy);

    @Select(
            value =
                    "<script>SELECT 'platform' AS source,d.id::text AS"
                        + " document_id,d.revision,d.name,d.kind,c.id::text AS"
                        + " chunk_id,c.text,c.page_start,c.page_end FROM reference_documents d JOIN"
                        + " reference_chunks c ON c.document_id=d.id AND"
                        + " c.app_users_id=d.app_users_id AND c.revision=d.revision JOIN"
                        + " reference_embeddings e ON e.chunk_id=c.id AND"
                        + " e.app_users_id=c.app_users_id  WHERE d.app_users_id=#{user} AND"
                        + " e.fingerprint=#{fingerprint} AND d.is_enabled AND d.status='ready' AND"
                        + " d.id IN <foreach collection=\"ids\" item=\"id\" open=\"(\""
                        + " separator=\",\" close=\")\">CAST(#{id} AS uuid)</foreach> AND"
                        + " 1-(e.embedding &lt;=&gt; CAST(#{vector} AS vector)) &gt;= 0.55 ORDER BY"
                        + " e.embedding &lt;=&gt; CAST(#{vector} AS vector) LIMIT 20</script>")
    List<ReferenceExcerptResponse> vectorSearch(
            @Param("user") long user,
            @Param("fingerprint") String fingerprint,
            @Param("ids") List<String> ids,
            @Param("vector") String vector);

    @Select(
            value =
                    "<script>SELECT 'platform' AS source,d.id::text AS"
                        + " document_id,d.revision,d.name,d.kind,c.id::text AS"
                        + " chunk_id,c.text,c.page_start,c.page_end FROM reference_documents d JOIN"
                        + " reference_chunks c ON c.document_id=d.id AND"
                        + " c.app_users_id=d.app_users_id AND c.revision=d.revision JOIN"
                        + " reference_embeddings e ON e.chunk_id=c.id AND"
                        + " e.app_users_id=c.app_users_id  WHERE d.app_users_id=#{user} AND"
                        + " e.fingerprint=#{fingerprint} AND d.is_enabled AND d.status='ready' AND"
                        + " d.id IN <foreach collection=\"ids\" item=\"id\" open=\"(\""
                        + " separator=\",\" close=\")\">CAST(#{id} AS uuid)</foreach> LIMIT"
                        + " 50000</script>")
    List<ReferenceExcerptResponse> keywordCandidates(
            @Param("user") long user,
            @Param("fingerprint") String fingerprint,
            @Param("ids") List<String> ids);

    record Totals(long files, long bytes) {}
}
