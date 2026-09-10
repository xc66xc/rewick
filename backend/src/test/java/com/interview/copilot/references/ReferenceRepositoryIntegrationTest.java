package com.interview.copilot.references;

import com.interview.copilot.common.ApiException;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import static org.assertj.core.api.Assertions.*;

@Tag("integration") @Testcontainers
class ReferenceRepositoryIntegrationTest {
    @Container static final ReferenceDatabase DATABASE=new ReferenceDatabase();
    private JdbcTemplate jdbc;
    private ReferenceRepository repository;
    @BeforeEach void setup() {
        var source=new DriverManagerDataSource(DATABASE.getJdbcUrl(),DATABASE.getUsername(),DATABASE.getPassword());
        jdbc=new JdbcTemplate(source); repository=new ReferenceRepository(jdbc,new DataSourceTransactionManager(source));
        jdbc.execute("TRUNCATE app_users RESTART IDENTITY CASCADE");
        jdbc.execute("INSERT INTO app_users(display_name,password_hash) VALUES('alice','fixture'),('bob','fixture')");
        jdbc.execute("UPDATE reference_policy SET max_files=20,max_total_bytes=104857600,max_chunks=10000");
    }
    @Test void require_foreignId_rejectsAndListStaysIsolated() {
        String id=UUID.randomUUID().toString(); repository.insert(1,id,"a.txt","a".repeat(64),100);
        assertThat(repository.list(2)).isEmpty();
        assertThatThrownBy(() -> repository.require(2,id)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> repository.delete(2,id)).isInstanceOf(ApiException.class);
        assertThat(repository.require(1,id).name()).isEqualTo("a.txt");
    }
    @Test void insert_parallelQuotaBoundary_acceptsOnlyOneAndCreatesOnlyOneJob() throws Exception {
        jdbc.execute("UPDATE reference_policy SET max_files=1");
        var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var futures=List.of(pool.submit(() -> insertAfter(start,"a")),pool.submit(() -> insertAfter(start,"b")));
            start.countDown();
            assertThat(List.of(futures.get(0).get(),futures.get(1).get())).containsExactlyInAnyOrder(true,false);
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reference_index_jobs",Integer.class)).isEqualTo(1);
    }
    @Test void delete_document_cascadesChunksVectorsAndTasks() {
        String id=UUID.randomUUID().toString(); repository.insert(1,id,"a.txt","a".repeat(64),100);
        jdbc.update("INSERT INTO reference_chunks(document_id,app_users_id,revision,ordinal,text,page_start,page_end) VALUES(?::uuid,1,1,0,'text',1,1)",id);
        jdbc.execute("INSERT INTO reference_embeddings(chunk_id,app_users_id,fingerprint,embedding) SELECT id,1,repeat('a',64),array_fill(0.1::real,ARRAY[1024])::vector FROM reference_chunks");
        repository.delete(1,id);
        for(String table:List.of("reference_documents","reference_chunks","reference_embeddings","reference_index_jobs"))
            assertThat(jdbc.queryForObject("SELECT count(*) FROM "+table,Integer.class)).isZero();
    }
    @Test void schema_vectorDimensionAndTenantForeignKey_enforcedByDatabase() {
        String id=UUID.randomUUID().toString(); repository.insert(1,id,"a.txt","a".repeat(64),100);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO reference_chunks(document_id,app_users_id,revision,ordinal,text,page_start,page_end) VALUES(?::uuid,2,1,0,'text',1,1)",id)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        jdbc.update("INSERT INTO reference_chunks(document_id,app_users_id,revision,ordinal,text,page_start,page_end) VALUES(?::uuid,1,1,0,'text',1,1)",id);
        assertThatThrownBy(() -> jdbc.execute("INSERT INTO reference_embeddings(chunk_id,app_users_id,fingerprint,embedding) SELECT id,1,repeat('a',64),'[1,2,3]'::vector FROM reference_chunks"))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
    }
    @Test void jobs_expiredLease_reclaimsAndRejectsStaleCompletion() {
        String id=UUID.randomUUID().toString(); repository.insert(1,id,"a.txt","a".repeat(64),100);
        var jobs=new ReferenceJobs(repository);
        var first=jobs.claim();
        assertThat(jobs.claim()).isNull();
        jdbc.execute("UPDATE reference_index_jobs SET lease_until=LOCALTIMESTAMP-INTERVAL '1 second'");
        var recovered=jobs.claim();
        assertThat(recovered.id()).isEqualTo(first.id());
        assertThat(recovered.token()).isNotEqualTo(first.token());
        var parsed=new ReferenceModels.Parsed(List.of(new ReferenceModels.Chunk(0,"Redis retry",1,1)),1);
        var vectors=List.of(java.util.Collections.nCopies(1024,0.1));
        jobs.publish(first,parsed,vectors,"a".repeat(64));
        assertThat(repository.require(1,id).status()).isEqualTo("pending");
        jobs.publish(recovered,parsed,vectors,"a".repeat(64));
        assertThat(repository.require(1,id).status()).isEqualTo("ready");
        assertThat(repository.require(1,id).chunkCount()).isEqualTo(1);
    }
    @Test void jobs_reindexAndDelete_oldJobsCannotRepublish() {
        String id=UUID.randomUUID().toString(); repository.insert(1,id,"a.txt","a".repeat(64),100);
        var jobs=new ReferenceJobs(repository); var first=jobs.claim();
        repository.reindex(1,id);
        var second=jobs.claim();
        var parsed=new ReferenceModels.Parsed(List.of(new ReferenceModels.Chunk(0,"Redis retry",1,1)),1);
        var vectors=List.of(java.util.Collections.nCopies(1024,0.1));
        jobs.publish(first,parsed,vectors,"a".repeat(64));
        assertThat(repository.require(1,id).status()).isEqualTo("pending");
        jobs.publish(second,parsed,vectors,"a".repeat(64));
        assertThat(repository.require(1,id).revision()).isEqualTo(2);
        repository.delete(1,id);
        jobs.publish(second,parsed,vectors,"a".repeat(64));
        assertThat(repository.list(1)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reference_embeddings",Integer.class)).isZero();
    }
    @Test void search_scopesSelectedUserModelAndEnabledDocuments_andFallsBackToKeywords() {
        String id=UUID.randomUUID().toString(); repository.insert(1,id,"a.txt","a".repeat(64),100);
        var jobs=new ReferenceJobs(repository);
        var vector=java.util.Collections.nCopies(1024,0.1);
        jobs.publish(jobs.claim(),new ReferenceModels.Parsed(List.of(new ReferenceModels.Chunk(0,"Redis cache consistency",1,1)),1),List.of(vector),"a".repeat(64));
        var client=org.mockito.Mockito.mock(PlatformEmbeddingClient.class);
        var config=new com.interview.copilot.ai.ProviderProperties.Embedding(); config.setModel("fixture"); config.setDimensions(1024);
        var selection=new PlatformEmbeddingClient.Selection(config,"a".repeat(64));
        org.mockito.Mockito.when(client.selection()).thenReturn(selection);
        org.mockito.Mockito.when(client.embed(org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.anyList())).thenReturn(List.of(vector));
        var usage=org.mockito.Mockito.mock(com.interview.copilot.usage.UsageService.class);
        org.mockito.Mockito.when(usage.start(org.mockito.ArgumentMatchers.anyLong(),org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.eq("knowledge")))
                .thenReturn(org.mockito.Mockito.mock(com.interview.copilot.usage.UsageLease.class));
        var search=new ReferenceSearchService(repository,client,usage);
        assertThat(search.search(1,"empty","Redis",List.of()).excerpts()).isEmpty();
        org.mockito.Mockito.verifyNoInteractions(client);
        var ids=List.of(UUID.fromString(id));
        assertThatThrownBy(() -> search.search(2,"foreign","Redis",ids)).isInstanceOf(ApiException.class);
        assertThat(search.search(1,"ready","Redis",ids).excerpts()).hasSize(1);
        repository.update(1,id,false,null);
        assertThat(search.search(1,"disabled","Redis",ids).excerpts()).isEmpty();
        repository.update(1,id,true,null);
        org.mockito.Mockito.when(client.selection()).thenReturn(new PlatformEmbeddingClient.Selection(config,"b".repeat(64)));
        assertThat(search.search(1,"other-model","Redis",ids).excerpts()).isEmpty();
        org.mockito.Mockito.when(client.selection()).thenReturn(selection);
        org.mockito.Mockito.when(client.embed(org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.anyList())).thenThrow(new IllegalStateException("fixture failure"));
        var fallback=search.search(1,"fallback","Redis",ids);
        assertThat(fallback.status()).isEqualTo("degraded");
        assertThat(fallback.excerpts()).hasSize(1);
    }
    private boolean insertAfter(CountDownLatch start,String hash) throws Exception {
        start.await();
        try { repository.insert(1,UUID.randomUUID().toString(),hash+".txt",hash.repeat(64),100); return true; }
        catch(ApiException expected) { return false; }
    }
}
