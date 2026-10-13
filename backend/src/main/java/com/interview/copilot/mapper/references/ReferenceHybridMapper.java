package com.interview.copilot.mapper.references;

import com.interview.copilot.entity.references.ReferenceScopeEntity;
import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import com.interview.copilot.entity.references.ReferenceContextEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import java.util.List;

@Mapper
public interface ReferenceHybridMapper {
    @Select("SELECT set_config('statement_timeout',#{milliseconds},true)")
    String timeout(@Param("milliseconds") String milliseconds);
    @Select("""
<script>SELECT d.id::text AS document_id,d.revision,d.name,d.kind FROM reference_documents d WHERE d.app_users_id=#{user} AND d.is_enabled AND d.status='ready' AND d.splitter_version=1 AND d.id IN <foreach collection="ids" item="id" open="(" close=")" separator=",">CAST(#{id} AS uuid)</foreach> ORDER BY d.id</script>
            """)
    List<ReferenceScopeEntity> scope(@Param("user") long user, @Param("ids") List<String> ids);
    @Select("""
<script>SELECT d.id::text AS document_id,c.revision,c.id AS chunk_id,c.context_id,c.ordinal,c.text,1-(e.embedding &lt;=&gt; CAST(#{vector} AS vector)) AS score FROM reference_documents d JOIN reference_chunks c ON c.document_id=d.id AND c.app_users_id=d.app_users_id AND c.revision=d.revision JOIN reference_embeddings e ON e.chunk_id=c.id AND e.app_users_id=c.app_users_id WHERE d.app_users_id=#{user} AND d.is_enabled AND d.status='ready' AND d.splitter_version=1 AND <foreach collection="scope" item="item" separator=" OR " open="(" close=")">(d.id=CAST(#{item.documentId} AS uuid) AND d.revision=#{item.revision})</foreach> AND e.fingerprint=#{fingerprint} AND c.context_id IS NOT NULL AND 1-(e.embedding &lt;=&gt; CAST(#{vector} AS vector)) &gt;= #{minimum} ORDER BY e.embedding &lt;=&gt; CAST(#{vector} AS vector),c.ordinal,c.id LIMIT 5</script>
            """)
    List<ReferenceCandidateEntity> vector(@Param("user") long user, @Param("scope") List<ReferenceScopeEntity> scope, @Param("vector") String vector, @Param("fingerprint") String fingerprint, @Param("minimum") double minimum);
    @Select("""
<script>
WITH eligible AS MATERIALIZED (
 SELECT d.id,d.app_users_id,d.revision FROM reference_documents d WHERE d.app_users_id=#{user} AND d.is_enabled AND d.status='ready' AND d.splitter_version=1 AND <foreach collection="scope" item="item" separator=" OR " open="(" close=")">(d.id=CAST(#{item.documentId} AS uuid) AND d.revision=#{item.revision})</foreach>
), corpus AS (
 SELECT COALESCE(sum(s.chunk_count),0)::double precision AS n, COALESCE(sum(s.token_count),0)::double precision / NULLIF(sum(s.chunk_count),0) AS average
 FROM reference_lexical_stats s JOIN eligible e ON s.document_id=e.id AND s.revision=e.revision AND s.app_users_id=e.app_users_id
), matches AS MATERIALIZED (
 SELECT t.chunk_id,t.term,t.term_frequency FROM reference_chunk_terms t JOIN eligible e ON t.document_id=e.id AND t.revision=e.revision AND t.app_users_id=e.app_users_id
 WHERE t.app_users_id=#{user} AND t.term IN <foreach collection="terms" item="term" open="(" close=")" separator=",">#{term}</foreach>
), df AS (SELECT term,count(*)::double precision AS frequency FROM matches GROUP BY term), scored AS (
 SELECT c.id AS chunk_id,c.ordinal,
 SUM(ln(1+(corpus.n-df.frequency+0.5)/(df.frequency+0.5))*m.term_frequency*(#{k1}+1)/(m.term_frequency+#{k1}*(1-#{b}+#{b}*c.token_length/corpus.average))) AS score
 FROM matches m JOIN reference_chunks c ON c.id=m.chunk_id AND c.app_users_id=#{user}
 JOIN df ON df.term=m.term CROSS JOIN corpus
 WHERE corpus.n &gt; 0 AND corpus.average &gt; 0 AND c.analyzer_version=1 AND c.context_id IS NOT NULL
 GROUP BY c.id
), best AS (
 SELECT chunk_id,score FROM scored WHERE score &gt; 0 ORDER BY score DESC,ordinal,chunk_id LIMIT 5
) SELECT c.document_id::text,c.revision,c.id AS chunk_id,c.context_id,c.ordinal,c.text,best.score
 FROM best JOIN reference_chunks c ON c.id=best.chunk_id AND c.app_users_id=#{user}
 ORDER BY best.score DESC,c.ordinal,c.id
</script>
            """)
    List<ReferenceCandidateEntity> bm25(@Param("user") long user, @Param("scope") List<ReferenceScopeEntity> scope, @Param("terms") List<String> terms, @Param("k1") double k1, @Param("b") double b);
    @Select("""
<script>WITH RECURSIVE ancestors AS (
 SELECT x.id AS context_id,s.parent_section_id AS ancestor,1 AS depth FROM reference_contexts x JOIN reference_sections s ON s.id=x.section_id AND s.app_users_id=x.app_users_id WHERE x.app_users_id=#{user} AND x.id IN <foreach collection="ids" item="id" open="(" close=")" separator=",">#{id}</foreach>
 UNION ALL SELECT a.context_id,s.parent_section_id,a.depth+1 FROM ancestors a JOIN reference_sections s ON s.id=a.ancestor AND s.app_users_id=#{user} WHERE a.depth &lt; 9
) SELECT d.id::text AS document_id,x.revision,x.id AS context_id,x.text,s.section_path,
 COALESCE((SELECT left(string_agg(left(p.introduction,240),E'\n' ORDER BY a.depth),240) FROM ancestors a JOIN reference_sections p ON p.id=a.ancestor AND p.app_users_id=#{user} WHERE a.context_id=x.id),'') AS introduction,
 x.paragraph_start,x.paragraph_end,x.is_split AS split
 FROM reference_contexts x JOIN reference_documents d ON d.id=x.document_id AND d.app_users_id=x.app_users_id JOIN reference_sections s ON s.id=x.section_id AND s.app_users_id=x.app_users_id
 WHERE d.app_users_id=#{user} AND d.is_enabled AND d.status='ready' AND d.splitter_version=1 AND <foreach collection="scope" item="item" separator=" OR " open="(" close=")">(d.id=CAST(#{item.documentId} AS uuid) AND d.revision=#{item.revision})</foreach> AND x.revision=d.revision AND x.id IN <foreach collection="ids" item="id" open="(" close=")" separator=",">#{id}</foreach></script>
            """)
    List<ReferenceContextEntity> contexts(@Param("user") long user, @Param("scope") List<ReferenceScopeEntity> scope, @Param("ids") List<Long> ids);
}
