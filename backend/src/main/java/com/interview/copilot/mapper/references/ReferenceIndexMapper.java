package com.interview.copilot.mapper.references;

import com.interview.copilot.model.references.ReferenceModels;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Update;
import java.util.Map;

@Mapper
public interface ReferenceIndexMapper {
    @Delete("DELETE FROM reference_sections WHERE document_id=CAST(#{job.documentId} AS uuid) AND app_users_id=#{job.userId} AND revision=#{job.revision}")
    void clearStaging(@Param("job") ReferenceModels.Job job);
    @Insert("""
        INSERT INTO reference_sections(document_id,app_users_id,revision,ordinal,parent_section_id,heading_level,title,section_path,introduction,paragraph_start,paragraph_end)
        VALUES(CAST(#{job.documentId} AS uuid),#{job.userId},#{job.revision},#{section.ordinal},
        (SELECT id FROM reference_sections WHERE document_id=CAST(#{job.documentId} AS uuid) AND app_users_id=#{job.userId} AND revision=#{job.revision} AND ordinal=#{section.parentOrdinal,jdbcType=INTEGER}),
        #{section.level},#{section.title},#{section.path},#{section.introduction},#{section.paragraphStart},#{section.paragraphEnd})
        """)
    void section(@Param("job") ReferenceModels.Job job, @Param("section") ReferenceModels.Section section);
    @Insert("""
        INSERT INTO reference_contexts(section_id,document_id,app_users_id,revision,ordinal,text,paragraph_start,paragraph_end,is_split)
        SELECT id,document_id,app_users_id,revision,#{context.ordinal},#{context.text},#{context.paragraphStart},#{context.paragraphEnd},#{context.split}
        FROM reference_sections WHERE document_id=CAST(#{job.documentId} AS uuid) AND app_users_id=#{job.userId} AND revision=#{job.revision} AND ordinal=#{context.sectionOrdinal}
        """)
    void context(@Param("job") ReferenceModels.Job job, @Param("context") ReferenceModels.Context context);
    @Select(value="""
        INSERT INTO reference_chunks(document_id,app_users_id,revision,ordinal,text,page_start,page_end,context_id,paragraph_start,paragraph_end,token_length,analyzer_version)
        SELECT document_id,app_users_id,revision,#{chunk.ordinal},#{chunk.text},0,0,id,#{chunk.paragraphStart},#{chunk.paragraphEnd},#{length},1
        FROM reference_contexts WHERE document_id=CAST(#{job.documentId} AS uuid) AND app_users_id=#{job.userId} AND revision=#{job.revision} AND ordinal=#{chunk.contextOrdinal}
        RETURNING id
        """, affectData=true)
    long chunk(@Param("job") ReferenceModels.Job job, @Param("chunk") ReferenceModels.Chunk chunk, @Param("length") int length);
    @Insert("""
        <script>INSERT INTO reference_chunk_terms(chunk_id,app_users_id,document_id,revision,term,term_frequency) VALUES
        <foreach collection="terms" index="term" item="frequency" separator=",">(#{id},#{job.userId},CAST(#{job.documentId} AS uuid),#{job.revision},#{term},#{frequency})</foreach></script>
        """)
    void terms(@Param("job") ReferenceModels.Job job, @Param("id") long id, @Param("terms") Map<String,Integer> terms);
    @Insert("""
        INSERT INTO reference_lexical_stats(document_id,app_users_id,revision,chunk_count,token_count)
        SELECT CAST(#{job.documentId} AS uuid),#{job.userId},#{job.revision},count(*) FILTER(WHERE token_length>0),COALESCE(sum(token_length),0)
        FROM reference_chunks WHERE document_id=CAST(#{job.documentId} AS uuid) AND app_users_id=#{job.userId} AND revision=#{job.revision}
        ON CONFLICT(document_id,revision) DO UPDATE SET chunk_count=EXCLUDED.chunk_count,token_count=EXCLUDED.token_count
        """)
    void statistics(@Param("job") ReferenceModels.Job job);
    @Select("SELECT count(*) FROM reference_chunk_terms WHERE app_users_id=#{user}")
    long totalTerms(@Param("user") long user);
    @Select("SELECT count(*) FROM reference_chunk_terms WHERE document_id=CAST(#{id} AS uuid)")
    long documentTerms(@Param("id") String id);
    @Select("SELECT count(*) FROM reference_contexts WHERE app_users_id=#{user}")
    long totalContexts(@Param("user") long user);
    @Select("SELECT count(*) FROM reference_sections WHERE app_users_id=#{user}")
    long totalSections(@Param("user") long user);
    @Select("""
        SELECT count(*) FROM reference_chunks c JOIN reference_embeddings e ON e.chunk_id=c.id AND e.app_users_id=c.app_users_id
        WHERE c.document_id=CAST(#{job.documentId} AS uuid) AND c.app_users_id=#{job.userId} AND c.revision=#{job.revision} AND e.fingerprint=#{fingerprint}
        """)
    int completeCount(@Param("job") ReferenceModels.Job job, @Param("fingerprint") String fingerprint);
    @Update("""
        UPDATE reference_documents SET revision=#{job.revision},status='ready',index_status='complete',index_error='',error='',splitter_version=1,
        format=#{parsed.format},heading_mode=#{parsed.headingMode},page_count=0,chunk_count=#{chunks},context_count=#{contexts},section_count=#{sections},updated_at=LOCALTIMESTAMP(6)
        WHERE id=CAST(#{job.documentId} AS uuid) AND app_users_id=#{job.userId} AND desired_revision=#{job.revision}
        """)
    void activate(@Param("job") ReferenceModels.Job job, @Param("parsed") ReferenceModels.Parsed parsed,
            @Param("chunks") int chunks, @Param("contexts") int contexts, @Param("sections") int sections);
    @Select("""
        SELECT DISTINCT document_id::text,app_users_id AS user_id FROM reference_index_jobs
        WHERE status IN ('complete','failed','cancelled') AND cleaned_at IS NULL
        AND updated_at<LOCALTIMESTAMP(6)-INTERVAL '10 minutes' ORDER BY user_id,document_id LIMIT 10
        """)
    java.util.List<com.interview.copilot.entity.references.ReferenceCleanupEntity> cleanupTargets();
    @Update("UPDATE reference_index_jobs SET cleaned_at=LOCALTIMESTAMP(6) WHERE app_users_id=#{user} AND document_id=CAST(#{id} AS uuid) AND status IN ('complete','failed','cancelled') AND updated_at<LOCALTIMESTAMP(6)-INTERVAL '10 minutes'")
    void cleaned(@Param("user") long user, @Param("id") String id);
    @Delete("""
        DELETE FROM reference_sections s USING reference_documents d WHERE s.document_id=d.id AND s.app_users_id=d.app_users_id AND s.revision<>d.revision AND d.app_users_id=#{user} AND d.id=CAST(#{id} AS uuid)
        AND (s.created_at<LOCALTIMESTAMP(6)-INTERVAL '10 minutes' OR s.revision<d.revision-1)
        AND NOT EXISTS(SELECT 1 FROM reference_index_jobs j WHERE j.document_id=d.id AND j.revision=s.revision AND j.status IN ('pending','running'))
        """)
    void cleanup(@Param("user") long user, @Param("id") String id);
    @Delete("""
        DELETE FROM reference_lexical_stats s USING reference_documents d WHERE s.document_id=d.id AND s.app_users_id=d.app_users_id
        AND s.revision<>d.revision AND d.app_users_id=#{user} AND d.id=CAST(#{id} AS uuid) AND NOT EXISTS(SELECT 1 FROM reference_chunks c WHERE c.document_id=s.document_id AND c.revision=s.revision)
        """)
    void cleanupStatistics(@Param("user") long user, @Param("id") String id);
}
