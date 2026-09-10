package com.interview.copilot.references;

import com.interview.copilot.common.ServerTime;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionTemplate;

@Repository
public class ReferenceRepository {
    static final String COLUMNS = "id,name,kind,is_enabled,status,page_count,content_hash,revision,created_at,updated_at,error,chunk_count";
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    public ReferenceRepository(JdbcTemplate jdbc, org.springframework.transaction.PlatformTransactionManager manager) {
        this.jdbc = jdbc; this.transaction = new TransactionTemplate(manager);
    }
    public JdbcTemplate jdbc() { return jdbc; }
    public TransactionTemplate transaction() { return transaction; }
    public List<ReferenceModels.Document> list(long user) {
        return jdbc.query("SELECT " + COLUMNS + " FROM reference_documents WHERE app_users_id=? ORDER BY created_at DESC", this::document, user);
    }
    public ReferenceModels.Document require(long user, String id) {
        var docs = jdbc.query("SELECT " + COLUMNS + " FROM reference_documents WHERE app_users_id=? AND id=CAST(? AS uuid)", this::document, user,id);
        if (docs.isEmpty()) { throw ReferenceErrors.missing(); }
        return docs.getFirst();
    }
    public void lockUser(long user) {
        var ids = jdbc.queryForList("SELECT id FROM app_users WHERE id=? FOR UPDATE", Long.class,user);
        if (ids.isEmpty()) { throw ReferenceErrors.missing(); }
    }
    public void insert(long user, String id, String name, String hash, long size) {
        transaction.executeWithoutResult(status -> {
            lockUser(user);
            var policy = jdbc.queryForMap("SELECT max_files,max_total_bytes FROM reference_policy WHERE id=1");
            var totals = jdbc.queryForMap("SELECT count(*) AS files,COALESCE(sum(file_size),0) AS bytes FROM reference_documents WHERE app_users_id=?",user);
            if (((Number)totals.get("files")).longValue() >= ((Number)policy.get("max_files")).longValue()
                    || ((Number)totals.get("bytes")).longValue()+size > ((Number)policy.get("max_total_bytes")).longValue()) { throw ReferenceErrors.limit(); }
            jdbc.update("INSERT INTO reference_documents(id,app_users_id,name,content_hash,file_size) VALUES(CAST(? AS uuid),?,?,?,?)",id,user,name,hash,size);
            enqueue(user,id,1);
        });
    }
    void enqueue(long user, String id, int revision) {
        jdbc.update("INSERT INTO reference_index_jobs(document_id,app_users_id,revision) VALUES(CAST(? AS uuid),?,?)",id,user,revision);
    }
    public void reindex(long user,String id) {
        transaction.executeWithoutResult(status -> {
            lockUser(user); require(user,id);
            int revision = jdbc.queryForObject("UPDATE reference_documents SET desired_revision=desired_revision+1,status='pending',error='',updated_at=LOCALTIMESTAMP(6) WHERE id=CAST(? AS uuid) AND app_users_id=? RETURNING desired_revision",Integer.class,id,user);
            jdbc.update("UPDATE reference_index_jobs SET status='cancelled',lease_token=NULL WHERE document_id=CAST(? AS uuid)",id);
            enqueue(user,id,revision);
        });
    }
    public void update(long user,String id,Boolean enabled,String kind) {
        require(user,id);
        jdbc.update("UPDATE reference_documents SET is_enabled=COALESCE(?,is_enabled),kind=COALESCE(?,kind),updated_at=LOCALTIMESTAMP(6) WHERE id=CAST(? AS uuid) AND app_users_id=?",enabled,kind,id,user);
    }
    public void delete(long user,String id) {
        transaction.executeWithoutResult(status -> {
            lockUser(user); require(user,id);
            jdbc.update("DELETE FROM reference_documents WHERE id=CAST(? AS uuid) AND app_users_id=?",id,user);
        });
    }
    public String preview(long user,String id) {
        var document = require(user,id);
        return String.join("\n\n",jdbc.queryForList("SELECT text FROM reference_chunks WHERE document_id=CAST(? AS uuid) AND app_users_id=? AND revision=? ORDER BY ordinal",String.class,id,user,document.revision()));
    }
    private ReferenceModels.Document document(ResultSet row,int index) throws SQLException {
        return new ReferenceModels.Document(row.getString("id"),row.getString("name"),row.getString("kind"),row.getBoolean("is_enabled"),row.getString("status"),row.getInt("page_count"),row.getString("content_hash"),row.getInt("revision"),
                ServerTime.instant(row.getObject("created_at",LocalDateTime.class)).toString(),ServerTime.instant(row.getObject("updated_at",LocalDateTime.class)).toString(),row.getString("error"),row.getInt("chunk_count"));
    }
}
