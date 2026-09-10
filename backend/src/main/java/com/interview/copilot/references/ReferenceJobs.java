package com.interview.copilot.references;

import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Repository;

@Repository
public class ReferenceJobs {
    private final ReferenceRepository repository;
    public ReferenceJobs(ReferenceRepository repository) { this.repository=repository; }
    public ReferenceModels.Job claim() {
        String token=UUID.randomUUID().toString();
        var jobs=repository.jdbc().query("""
            UPDATE reference_index_jobs SET status='running',lease_token=CAST(? AS uuid),lease_until=LOCALTIMESTAMP(6)+INTERVAL '90 seconds',attempts=attempts+1,updated_at=LOCALTIMESTAMP(6)
            WHERE id=(SELECT id FROM reference_index_jobs WHERE status='pending' OR (status='running' AND lease_until<LOCALTIMESTAMP(6)) ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
            RETURNING id,document_id,app_users_id,revision
            """,(row,index)->new ReferenceModels.Job(row.getLong("id"),row.getString("document_id"),row.getLong("app_users_id"),row.getInt("revision"),token),token);
        return jobs.isEmpty()?null:jobs.getFirst();
    }
    public boolean renew(ReferenceModels.Job job) {
        return repository.jdbc().update("UPDATE reference_index_jobs SET lease_until=LOCALTIMESTAMP(6)+INTERVAL '90 seconds' WHERE id=? AND lease_token=CAST(? AS uuid) AND status='running'",job.id(),job.token())==1;
    }
    public void indexing(ReferenceModels.Job job) {
        repository.jdbc().update("UPDATE reference_documents SET status='indexing',updated_at=LOCALTIMESTAMP(6) WHERE id=CAST(? AS uuid) AND desired_revision=?",job.documentId(),job.revision());
    }
    public void publish(ReferenceModels.Job job,ReferenceModels.Parsed parsed,List<List<Double>> vectors,String fingerprint) {
        repository.transaction().executeWithoutResult(status->{
            repository.lockUser(job.userId());
            if(!renew(job)) { return; }
            var current=repository.jdbc().queryForList("SELECT desired_revision FROM reference_documents WHERE id=CAST(? AS uuid) AND app_users_id=? FOR UPDATE",Integer.class,job.documentId(),job.userId());
            if(current.isEmpty() || current.getFirst()!=job.revision()) { return; }
            checkQuota(job,parsed.chunks().size());
            repository.jdbc().update("DELETE FROM reference_chunks WHERE document_id=CAST(? AS uuid)",job.documentId());
            for(int i=0;i<parsed.chunks().size();i++) { insert(job,parsed.chunks().get(i),vectors.get(i),fingerprint); }
            repository.jdbc().update("UPDATE reference_documents SET revision=?,status='ready',page_count=?,chunk_count=?,error='',updated_at=LOCALTIMESTAMP(6) WHERE id=CAST(? AS uuid)",job.revision(),parsed.pageCount(),parsed.chunks().size(),job.documentId());
            repository.jdbc().update("UPDATE reference_index_jobs SET status='complete',embedded_chunks=?,lease_until=NULL,updated_at=LOCALTIMESTAMP(6) WHERE id=?",vectors.size(),job.id());
        });
    }
    private void checkQuota(ReferenceModels.Job job,int count) {
        long existing=repository.jdbc().queryForObject("SELECT COALESCE(sum(chunk_count),0) FROM reference_documents WHERE app_users_id=? AND id<>CAST(? AS uuid)",Long.class,job.userId(),job.documentId());
        int maximum=repository.jdbc().queryForObject("SELECT max_chunks FROM reference_policy WHERE id=1",Integer.class);
        if(existing+count>maximum) { throw ReferenceErrors.limit(); }
    }
    private void insert(ReferenceModels.Job job,ReferenceModels.Chunk chunk,List<Double> vector,String fingerprint) {
        Long id=repository.jdbc().queryForObject("INSERT INTO reference_chunks(document_id,app_users_id,revision,ordinal,text,page_start,page_end) VALUES(CAST(? AS uuid),?,?,?,?,?,?) RETURNING id",Long.class,job.documentId(),job.userId(),job.revision(),chunk.ordinal(),chunk.text(),chunk.pageStart(),chunk.pageEnd());
        repository.jdbc().update("INSERT INTO reference_embeddings(chunk_id,app_users_id,fingerprint,embedding) VALUES(?,?,?,CAST(? AS vector))",id,job.userId(),fingerprint,vector.toString());
    }
    public void fail(ReferenceModels.Job job,String error) {
        repository.transaction().executeWithoutResult(status->{
            repository.lockUser(job.userId());
            if(!renew(job)) { return; }
            repository.jdbc().update("UPDATE reference_index_jobs SET status='failed',error=?,lease_until=NULL,updated_at=LOCALTIMESTAMP(6) WHERE id=?",error,job.id());
            repository.jdbc().update("UPDATE reference_documents SET status='error',error=?,updated_at=LOCALTIMESTAMP(6) WHERE id=CAST(? AS uuid) AND desired_revision=?",error,job.documentId(),job.revision());
        });
    }
}
