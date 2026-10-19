package com.interview.copilot.service.impl.references;

import static org.assertj.core.api.Assertions.*;

import com.interview.copilot.common.references.PlatformEmbeddingClient;
import com.interview.copilot.common.references.ReferenceDatabase;
import com.interview.copilot.common.references.ReferencePersistenceFixture;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.model.references.ReferenceModels;
import com.interview.copilot.service.references.ReferenceStorageService;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;

@Tag("integration")
@Testcontainers
public class ReferenceStorageServiceIntegrationTest {
    @Container static final ReferenceDatabase DATABASE = new ReferenceDatabase();
    private JdbcTemplate jdbc;
    private ReferenceStorageService repository;
    private ReferencePersistenceFixture persistence;

    @BeforeEach
    void setup() {
        var source =
                new DriverManagerDataSource(
                        DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
        jdbc = new JdbcTemplate(source);
        persistence = new ReferencePersistenceFixture(source);
        repository = persistence.storage;
        jdbc.execute("TRUNCATE app_users RESTART IDENTITY CASCADE");
        jdbc.execute(
                "INSERT INTO app_users(display_name,password_hash)"
                        + " VALUES('alice','fixture'),('bob','fixture')");
        jdbc.execute(
                "UPDATE reference_policy SET"
                        + " max_files=20,max_total_bytes=104857600,max_chunks=10000");
    }

    @Test
    void require_foreignId_rejectsAndListStaysIsolated() {
        String id = UUID.randomUUID().toString();
        repository.insert(1, id, "a.md", "a".repeat(64), 100);
        assertThat(repository.list(2)).isEmpty();
        assertThatThrownBy(() -> repository.require(2, id)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> repository.delete(2, id)).isInstanceOf(ApiException.class);
        assertThat(repository.require(1, id).name()).isEqualTo("a.md");
    }

    @Test
    void insert_parallelQuotaBoundary_acceptsOnlyOneAndCreatesOnlyOneJob() throws Exception {
        jdbc.execute("UPDATE reference_policy SET max_files=1");
        var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var futures =
                    List.of(
                            pool.submit(() -> insertAfter(start, "a")),
                            pool.submit(() -> insertAfter(start, "b")));
            start.countDown();
            assertThat(List.of(futures.get(0).get(), futures.get(1).get()))
                    .containsExactlyInAnyOrder(true, false);
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reference_index_jobs", Integer.class))
                .isEqualTo(1);
    }

    @Test
    void delete_document_cascadesChunksVectorsAndTasks() {
        String id = UUID.randomUUID().toString();
        repository.insert(1, id, "a.md", "a".repeat(64), 100);
        jdbc.update(
                "INSERT INTO"
                    + " reference_chunks(document_id,app_users_id,revision,ordinal,text,page_start,page_end)"
                    + " VALUES(?::uuid,1,1,0,'text',1,1)",
                id);
        jdbc.execute(
                "INSERT INTO reference_embeddings(chunk_id,app_users_id,fingerprint,embedding)"
                    + " SELECT id,1,repeat('a',64),array_fill(0.1::real,ARRAY[1024])::vector FROM"
                    + " reference_chunks");
        repository.delete(1, id);
        for (String table :
                List.of(
                        "reference_documents",
                        "reference_chunks",
                        "reference_embeddings",
                        "reference_index_jobs"))
            assertThat(jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class))
                    .isZero();
    }

    @Test
    void schema_vectorDimensionAndTenantForeignKey_enforcedByDatabase() {
        String id = UUID.randomUUID().toString();
        repository.insert(1, id, "a.md", "a".repeat(64), 100);
        assertThatThrownBy(
                        () ->
                                jdbc.update(
                                        "INSERT INTO"
                                            + " reference_chunks(document_id,app_users_id,revision,ordinal,text,page_start,page_end)"
                                            + " VALUES(?::uuid,2,1,0,'text',1,1)",
                                        id))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        jdbc.update(
                "INSERT INTO"
                    + " reference_chunks(document_id,app_users_id,revision,ordinal,text,page_start,page_end)"
                    + " VALUES(?::uuid,1,1,0,'text',1,1)",
                id);
        assertThatThrownBy(
                        () ->
                                jdbc.execute(
                                        "INSERT INTO"
                                            + " reference_embeddings(chunk_id,app_users_id,fingerprint,embedding)"
                                            + " SELECT id,1,repeat('a',64),'[1,2,3]'::vector FROM"
                                            + " reference_chunks"))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
    }

    @Test
    void jobs_expiredLease_reclaimsAndRejectsStaleCompletion() {
        String id = UUID.randomUUID().toString();
        repository.insert(1, id, "a.md", "a".repeat(64), 100);
        var jobs = persistence.jobs;
        var first = jobs.claim();
        assertThat(jobs.claim()).isNull();
        jdbc.execute(
                "UPDATE reference_index_jobs SET lease_until=LOCALTIMESTAMP-INTERVAL '1 second'");
        var recovered = jobs.claim();
        assertThat(recovered.id()).isEqualTo(first.id());
        assertThat(recovered.token()).isNotEqualTo(first.token());
        var parsed = parsed("Redis retry");
        var vectors = List.of(java.util.Collections.nCopies(1024, 0.1));
        publish(first, parsed, vectors, "a".repeat(64));
        assertThat(repository.require(1, id).status()).isEqualTo("pending");
        publish(recovered, parsed, vectors, "a".repeat(64));
        assertThat(repository.require(1, id).status()).isEqualTo("ready");
        assertThat(repository.require(1, id).chunkCount()).isEqualTo(1);
    }

    @Test
    void jobs_reindexAndDelete_oldJobsCannotRepublish() {
        String id = UUID.randomUUID().toString();
        repository.insert(1, id, "a.md", "a".repeat(64), 100);
        var jobs = persistence.jobs;
        var first = jobs.claim();
        repository.reindex(1, id);
        var second = jobs.claim();
        var parsed = parsed("Redis retry");
        var vectors = List.of(java.util.Collections.nCopies(1024, 0.1));
        publish(first, parsed, vectors, "a".repeat(64));
        assertThat(repository.require(1, id).status()).isEqualTo("pending");
        publish(second, parsed, vectors, "a".repeat(64));
        assertThat(repository.require(1, id).revision()).isEqualTo(2);
        repository.delete(1, id);
        publish(second, parsed, vectors, "a".repeat(64));
        assertThat(repository.list(1)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reference_embeddings", Integer.class))
                .isZero();
    }

    @Test
    void hybrid_sameDocumentBothBranches_fusesParentAndScopesUsers() {
        String id = UUID.randomUUID().toString();
        repository.insert(1,id,"cache.md","a".repeat(64),100);
        var job = persistence.jobs.claim();
        var parsed = parsed("# 缓存\nRedis cache consistency and Redis hot key protection");
        publish(job,parsed,List.of(java.util.Collections.nCopies(1024,0.1)),"a".repeat(64));
        var scope = persistence.hybrid.scope(1,List.of(id));
        var lexical = persistence.hybrid.bm25(1,scope,new com.interview.copilot.common.references.ReferenceAnalyzer().query("Redis"),1.2,0.75);
        var vector = persistence.hybrid.vector(1,scope,java.util.Collections.nCopies(1024,0.1).toString(),"a".repeat(64),0.55);
        assertThat(lexical).hasSize(1);
        assertThat(vector).hasSize(1);
        var fused = new com.interview.copilot.common.references.ReferenceFusion().fuse(lexical,vector,60);
        assertThat(fused).hasSize(1);
        assertThat(fused.getFirst().rrfScore()).isCloseTo(2.0/61,org.assertj.core.data.Offset.offset(1e-10));
        assertThat(persistence.hybrid.contexts(1,scope,List.of(fused.getFirst().contextId()))).hasSize(1);
        assertThat(persistence.hybrid.scope(2,List.of(id))).isEmpty();
        repository.update(1,id,false,null);
        assertThat(persistence.hybrid.scope(1,List.of(id))).isEmpty();
    }
    @Test
    void bm25_handCalculatedCorpus_matchesFormulaAndTopFour() {
        String id=UUID.randomUUID().toString();
        repository.insert(1,id,"formula.md","b".repeat(64),100);
        String text="## one\nredis redis cache\n## two\nredis queue queue queue\n## three\nqueue";
        var data=parsed(text);
        publish(persistence.jobs.claim(),data,java.util.Collections.nCopies(data.chunks().size(),java.util.Collections.nCopies(1024,0.1)),"a".repeat(64));
        var scope=persistence.hybrid.scope(1,List.of(id));
        var result=persistence.hybrid.bm25(1,scope,List.of("redis"),1.2,0.75);
        assertThat(result).hasSize(2);
        double n=jdbc.queryForObject("SELECT chunk_count FROM reference_lexical_stats WHERE document_id=?::uuid",Double.class,id);
        double total=jdbc.queryForObject("SELECT token_count FROM reference_lexical_stats WHERE document_id=?::uuid",Double.class,id);
        double dl=jdbc.queryForObject("SELECT token_length FROM reference_chunks WHERE id=?",Double.class,result.getFirst().chunkId());
        double tf=jdbc.queryForObject("SELECT term_frequency FROM reference_chunk_terms WHERE chunk_id=? AND term='redis'",Double.class,result.getFirst().chunkId());
        double expected=Math.log(1+(n-2+0.5)/(2+0.5))*tf*2.2/(tf+1.2*(0.25+0.75*dl/(total/n)));
        assertThat(result.getFirst().score()).isCloseTo(expected,org.assertj.core.data.Offset.offset(1e-10));
    }
    @Test
    void index_sixtySyntheticCases_keepsTopCaps() {
        String id=UUID.randomUUID().toString();
        repository.insert(1,id,"cases.md","c".repeat(64),100);
        var text=new StringBuilder("# 测试场景\n");
        for(int i=0;i<60;i++) text.append("## q").append(i).append("\n缓存 q").append(i).append(" 使用互斥锁保护热点请求。\n");
        var data=parsed(text.toString());
        List<List<Double>> vectors=new java.util.ArrayList<>();
        for(int i=0;i<data.chunks().size();i++) {
            var v=new java.util.ArrayList<>(java.util.Collections.nCopies(1024,0.0));v.set(i,1.0);vectors.add(v);
        }
        publish(persistence.jobs.claim(),data,vectors,"a".repeat(64));
        var scope=persistence.hybrid.scope(1,List.of(id));
        for(int i=0;i<60;i++) {
            var lexical=persistence.hybrid.bm25(1,scope,List.of("q"+i),1.2,0.75);
            var semantic=persistence.hybrid.vector(1,scope,vectors.get(i).toString(),"a".repeat(64),0.55);
            assertThat(lexical).hasSize(1);
            assertThat(semantic).hasSize(1);
            var fused=new com.interview.copilot.common.references.ReferenceFusion().fuse(lexical,semantic,60);
            assertThat(fused).hasSize(1);
            assertThat(fused.getFirst().contextId()).isEqualTo(lexical.getFirst().contextId());
        }
        assertThat(persistence.hybrid.bm25(1,scope,List.of("缓存"),1.2,0.75)).hasSize(4);

    }
    @Test
    void reindex_activeGeneration_isAvailableAndFailedBuildDoesNotReplaceIt() {
        String id=UUID.randomUUID().toString();repository.insert(1,id,"generation.md","d".repeat(64),100);
        var data=parsed("# 标题\nRedis generation");
        publish(persistence.jobs.claim(),data,List.of(java.util.Collections.nCopies(1024,0.1)),"a".repeat(64));
        repository.reindex(1,id);
        assertThat(repository.require(1,id).status()).isEqualTo("ready");
        var job=persistence.jobs.claim();persistence.jobs.indexing(job);persistence.jobs.fail(job,"fake index error");
        assertThat(repository.require(1,id).revision()).isEqualTo(1);
        assertThat(persistence.hybrid.scope(1,List.of(id))).hasSize(1);
        assertThat(repository.require(1,id).indexError()).isEqualTo("fake index error");
    }

    @Test
    void cleanup_expiredGeneration_preservesActiveAndMarksJobsOnce() {
        String id=UUID.randomUUID().toString();repository.insert(1,id,"cleanup.md","e".repeat(64),100);
        var data=parsed("# 标题\nRedis cleanup");
        var vectors=List.of(java.util.Collections.nCopies(1024,0.1));
        publish(persistence.jobs.claim(),data,vectors,"a".repeat(64));
        repository.reindex(1,id);
        publish(persistence.jobs.claim(),data,vectors,"a".repeat(64));
        jdbc.update("UPDATE reference_sections SET created_at=LOCALTIMESTAMP-INTERVAL '20 minutes' WHERE document_id=?::uuid AND revision=1",id);
        jdbc.update("UPDATE reference_index_jobs SET updated_at=LOCALTIMESTAMP-INTERVAL '20 minutes' WHERE document_id=?::uuid",id);
        persistence.jobs.cleanup();persistence.jobs.cleanup();
        assertThat(jdbc.queryForList("SELECT DISTINCT revision FROM reference_chunks WHERE document_id=?::uuid",Integer.class,id)).containsExactly(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reference_index_jobs WHERE document_id=?::uuid AND cleaned_at IS NULL",Integer.class,id)).isZero();
        assertThat(persistence.hybrid.scope(1,List.of(id))).hasSize(1);
    }

    @Test
    @Tag("performance")
    void bm25_capacityBenchmark_recordsCommonTermLatencyWithoutScanningTextInJava() throws Exception {
        if (!Boolean.getBoolean("copilot.references.capacityBenchmark")) return;
        for(int i=0;i<10;i++) {
            String id=UUID.randomUUID().toString();
            jdbc.update("INSERT INTO reference_documents(id,app_users_id,name,content_hash,file_size,status,revision,splitter_version,chunk_count) VALUES(?::uuid,1,?, ?,100,'ready',1,1,5000)",id,"load"+i+".md",Integer.toString(i).repeat(64));
            long section=jdbc.queryForObject("INSERT INTO reference_sections(document_id,app_users_id,revision,ordinal,heading_level,title,section_path,introduction,paragraph_start,paragraph_end) VALUES(?::uuid,1,1,0,1,'load','load','load',1,1) RETURNING id",Long.class,id);
            jdbc.update("INSERT INTO reference_contexts(section_id,document_id,app_users_id,revision,ordinal,text,paragraph_start,paragraph_end) SELECT ?,?::uuid,1,1,n,'load',1,1 FROM generate_series(0,4999) n",section,id);
            jdbc.update("INSERT INTO reference_chunks(document_id,app_users_id,revision,ordinal,text,page_start,page_end,context_id,token_length,analyzer_version) SELECT document_id,1,1,ordinal,'load',0,0,id,40,1 FROM reference_contexts WHERE document_id=?::uuid",id);
            jdbc.update("INSERT INTO reference_lexical_stats(document_id,app_users_id,revision,chunk_count,token_count) VALUES(?::uuid,1,1,5000,200000)",id);
        }
        jdbc.execute("INSERT INTO reference_chunk_terms(chunk_id,app_users_id,document_id,revision,term,term_frequency) SELECT c.id,1,c.document_id,1,'term'||n,1 FROM reference_chunks c CROSS JOIN generate_series(0,39) n");
        jdbc.execute("ANALYZE reference_chunk_terms; ANALYZE reference_chunks; ANALYZE reference_lexical_stats; ANALYZE reference_documents");
        var ids=repository.list(1).stream().map(d -> d.id()).toList();
        var scope=persistence.hybrid.scope(1,ids);
        var query=java.util.stream.IntStream.range(0,32).mapToObj(i -> "term"+i).toList();
        java.util.List<Double> timings=new java.util.ArrayList<>();
        for(int i=0;i<5;i++) {
            long start=System.nanoTime();
            assertThat(persistence.hybrid.bm25(1,scope,query,1.2,0.75)).hasSize(4);
            timings.add((System.nanoTime()-start)/1_000_000.0);
        }
        var tx=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));
        tx.setReadOnly(true);
        long start=System.nanoTime();
        String protection;
        try {
            tx.execute(status -> { persistence.hybrid.timeout("300");return persistence.hybrid.bm25(1,scope,query,1.2,0.75); });
            protection="completed within limit";
        } catch(org.springframework.dao.DataAccessException error) {
            assertThat(error.getMostSpecificCause().getMessage()).contains("statement timeout");
            protection="statement timeout";
        }
        java.nio.file.Files.writeString(java.nio.file.Path.of("target/hybrid-capacity-benchmark.txt"),"chunks=50000; postings=2000000; queryTerms=32; commonTermMs="+timings+"; protection="+protection+"; protectedMs="+(System.nanoTime()-start)/1_000_000.0+"\n");
    }

    @Test
    void qa_questionVectorRecallsAnswerWithoutBodySimilarity_andDeduplicatesAcrossContexts() {
        String id=UUID.randomUUID().toString();
        repository.insert(1,id,"qa.md","f".repeat(64),100);
        var data=parsed("# 题库\n## 你还有什么其他问题吗？\n反问团队的工作方式。\n### 技术挑战\n了解当前技术债。\n## 如何实现缓存？\n使用Redis缓存。");
        var job=persistence.jobs.claim();
        assertThat(persistence.jobs.prepare(job,data)).isTrue();
        assertThat(persistence.jobs.stage(job,data.chunks(),java.util.Collections.nCopies(data.chunks().size(),axis(1)),"qa-fingerprint")).isTrue();
        var questions=data.sections().stream().filter(section -> !section.questionText().isBlank()).toList();
        assertThat(persistence.jobs.stageQuestions(job,questions,List.of(axis(0),axis(2)),"qa-fingerprint")).isTrue();
        persistence.jobs.publish(job,data,"qa-fingerprint");
        var scope=persistence.hybrid.scope(1,List.of(id));
        var semantic=persistence.hybrid.questions(1,scope,axis(0).toString(),"qa-fingerprint",0.9);
        assertThat(semantic).hasSize(1);
        assertThat(persistence.hybrid.vector(1,scope,axis(0).toString(),"qa-fingerprint",0.55)).isEmpty();
        var lexical=persistence.hybrid.bm25(1,scope,new com.interview.copilot.common.references.ReferenceAnalyzer().query("技术债"),1.2,0.75);
        assertThat(lexical).hasSize(1);
        assertThat(lexical.getFirst().qaId()).isEqualTo(semantic.getFirst().qaId());
        assertThat(lexical.getFirst().contextId()).isNotEqualTo(semantic.getFirst().contextId());
        var fused=new com.interview.copilot.common.references.ReferenceFusion().fuse(lexical,semantic,60);
        assertThat(fused).hasSize(1);
        var answer=persistence.hybrid.contexts(1,scope,List.of(fused.getFirst().contextId())).getFirst();
        assertThat(answer.text()).contains("工作方式","技术挑战","技术债").doesNotContain("Redis");
        assertThat(answer.sectionPath()).endsWith("你还有什么其他问题吗？");
        assertThat(persistence.hybrid.questions(2,scope,axis(0).toString(),"qa-fingerprint",0)).isEmpty();
        assertThat(persistence.hybrid.questions(1,scope,axis(0).toString(),"other-model",0)).isEmpty();
        repository.delete(1,id);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reference_question_vectors",Integer.class)).isZero();
    }
    @Test
    void qa_longAnswerKeepsOneCandidate_andRequiresCompleteQuestionIndex() {
        String id=UUID.randomUUID().toString();
        repository.insert(1,id,"long-qa.md","g".repeat(64),100);
        var data=parsed("## 为什么使用Redis？\n"+"Redis提升读取效率，缓存需要一致性保障。".repeat(150));
        var job=persistence.jobs.claim();
        persistence.jobs.prepare(job,data);
        persistence.jobs.stage(job,data.chunks(),java.util.Collections.nCopies(data.chunks().size(),axis(0)),"qa-fingerprint");
        assertThatThrownBy(() -> persistence.jobs.publish(job,data,"qa-fingerprint")).isInstanceOf(ApiException.class);
        assertThat(repository.require(1,id).status()).isNotEqualTo("ready");
        persistence.jobs.stageQuestions(job,data.sections(),List.of(axis(0)),"qa-fingerprint");
        persistence.jobs.publish(job,data,"qa-fingerprint");
        var scope=persistence.hybrid.scope(1,List.of(id));
        assertThat(persistence.hybrid.vector(1,scope,axis(0).toString(),"qa-fingerprint",0.55)).hasSize(1);
        var lexical=persistence.hybrid.bm25(1,scope,List.of("redis"),1.2,0.75);
        assertThat(lexical).hasSize(1);
        var answer=persistence.hybrid.contexts(1,scope,List.of(lexical.getFirst().contextId())).getFirst();
        assertThat(answer.split()).isTrue();
        assertThat(answer.text()).hasSizeLessThanOrEqualTo(1600);
    }
    @Test
    void recall_sixMatchingQuestions_capsAllSqlRoutesAtFour() {
        String id=UUID.randomUUID().toString();
        repository.insert(1,id,"caps.md","h".repeat(64),100);
        var text=new StringBuilder("# 题库\n");
        for(int i=1;i<=6;i++) text.append("## Q").append(i).append("：如何使用缓存？\nRedis缓存保护热点请求。\n");
        var data=parsed(text.toString());
        assertThat(data.sections().stream().filter(section -> !section.questionText().isBlank())).hasSize(6);
        var vector=java.util.Collections.nCopies(1024,0.1);
        publish(persistence.jobs.claim(),data,java.util.Collections.nCopies(data.chunks().size(),vector),"a".repeat(64));
        var scope=persistence.hybrid.scope(1,List.of(id));
        var lexical=persistence.hybrid.bm25(1,scope,List.of("redis"),1.2,0.75);
        var body=persistence.hybrid.vector(1,scope,vector.toString(),"a".repeat(64),0.55);
        var questions=persistence.hybrid.questions(1,scope,vector.toString(),"a".repeat(64),0);
        assertThat(lexical).hasSize(4);
        assertThat(body).hasSize(4);
        assertThat(questions).hasSize(4);
        var semantic=com.interview.copilot.common.references.ReferenceVectorFusion.fuse(questions,body,60);
        assertThat(semantic).hasSize(4);
        assertThat(new com.interview.copilot.common.references.ReferenceFusion().fuse(lexical,semantic,60)).hasSize(2);
    }

    private List<Double> axis(int index) {
        var vector=new java.util.ArrayList<>(java.util.Collections.nCopies(1024,0.0));
        vector.set(index,1.0);
        return vector;
    }

    private ReferenceModels.Parsed parsed(String text) {
        return new com.interview.copilot.common.references.ReferenceChunkPlanner().plan(
                new com.interview.copilot.common.references.MarkdownSectionParser().parse(text),"md",com.interview.copilot.dto.references.ReferencePolicy.defaults());
    }
    private void publish(ReferenceModels.Job job, ReferenceModels.Parsed parsed, java.util.List<java.util.List<Double>> vectors, String fingerprint) {
        if (!persistence.jobs.prepare(job,parsed)) return;
        if (!persistence.jobs.stage(job,parsed.chunks(),vectors,fingerprint)) return;
        var questions=parsed.sections().stream().filter(section -> !section.questionText().isBlank()).toList();
        if (!persistence.jobs.stageQuestions(job,questions,java.util.Collections.nCopies(questions.size(),java.util.Collections.nCopies(1024,0.1)),fingerprint)) return;
        persistence.jobs.publish(job,parsed,fingerprint);
    }

    private boolean insertAfter(CountDownLatch start, String hash) throws Exception {
        start.await();
        try {
            repository.insert(1, UUID.randomUUID().toString(), hash + ".md", hash.repeat(64), 100);
            return true;
        } catch (ApiException expected) {
            return false;
        }
    }
}
