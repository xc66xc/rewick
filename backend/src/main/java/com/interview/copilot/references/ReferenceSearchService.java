package com.interview.copilot.references;

import com.interview.copilot.ai.LlmRequestPolicy;
import com.interview.copilot.usage.UsageService;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class ReferenceSearchService {
    private static final Logger LOG=LoggerFactory.getLogger(ReferenceSearchService.class);
    private static final String ROWS="d.id,d.revision,d.name,d.kind,c.id AS chunk_id,c.text,c.page_start,c.page_end";
    private static final String JOIN=" FROM reference_documents d JOIN reference_chunks c ON c.document_id=d.id AND c.app_users_id=d.app_users_id AND c.revision=d.revision JOIN reference_embeddings e ON e.chunk_id=c.id AND e.app_users_id=c.app_users_id ";
    private final ReferenceRepository repository;
    private final PlatformEmbeddingClient embedding;
    private final UsageService usage;
    public ReferenceSearchService(ReferenceRepository repository,PlatformEmbeddingClient embedding,UsageService usage) {
        this.repository=repository; this.embedding=embedding; this.usage=usage;
    }
    public ReferenceModels.Retrieval search(long user,String requestId,String query,List<UUID> ids) {
        if(ids.isEmpty()) { return result("disabled","当前环境未选择参考资料。",List.of()); }
        for(UUID id:ids) { repository.require(user,id.toString()); }
        String identifier=LlmRequestPolicy.requestId(requestId);
        try(var lease=usage.start(user,identifier,"knowledge")) {
            try {
                var selection=embedding.selection();
                usage.describeModel(user,identifier,"knowledge",selection.config().getModel());
                ReferenceModels.Retrieval result=retrieve(user,query,ids,selection);
                lease.complete(); return result;
            } catch(RuntimeException error) {
                lease.fail(); LOG.warn("Reference search unavailable user={} exceptionType={}",user,error.getClass().getSimpleName());
                return result("degraded","资料检索暂时不可用，继续生成回答。",List.of());
            }
        }
    }
    private ReferenceModels.Retrieval retrieve(long user,String query,List<UUID> ids,PlatformEmbeddingClient.Selection selection) {
        List<Double> vector;
        try { vector=embedding.embed(selection,List.of(query)).getFirst(); }
        catch(RuntimeException error) {
            LOG.warn("Reference vector lookup failed user={} exceptionType={}; using keyword retrieval",user,error.getClass().getSimpleName());
            return result("degraded","向量服务暂不可用，已使用资料关键词检索。",keyword(user,query,ids,selection.fingerprint()));
        }
        List<Object> args=new ArrayList<>(); args.add(vector.toString()); args.add(user); args.add(selection.fingerprint()); ids.forEach(id->args.add(id.toString()));
        String sql="SELECT "+ROWS+",1-(e.embedding <=> CAST(? AS vector)) AS similarity"+JOIN+scope(ids)+" ORDER BY similarity DESC LIMIT 20";
        var rows=repository.jdbc().query(sql,(row,index)->new Scored(excerpt(row),row.getDouble("similarity")),args.toArray());
        var excerpts=rows.stream().filter(row->row.score()>=0.55).map(Scored::excerpt).toList();
        return result(excerpts.isEmpty()?"empty":"ready",excerpts.isEmpty()?"未找到相关资料；模型变更后请重建资料。":"",excerpts);
    }
    private List<ReferenceModels.Excerpt> keyword(long user,String query,List<UUID> ids,String fingerprint) {
        List<Object> args=new ArrayList<>(); args.add(user); args.add(fingerprint); ids.forEach(id->args.add(id.toString()));
        Set<String> terms=terms(query);
        if(terms.isEmpty()) { return List.of(); }
        return repository.jdbc().query("SELECT "+ROWS+JOIN+scope(ids)+" LIMIT 50000",(row,index)->excerpt(row),args.toArray()).stream()
                .map(excerpt->new Scored(excerpt,score(excerpt.text(),terms))).filter(row->row.score()>0)
                .sorted(Comparator.comparingDouble(Scored::score).reversed()).limit(20).map(Scored::excerpt).toList();
    }
    private String scope(List<UUID> ids) {
        return " WHERE d.app_users_id=? AND e.fingerprint=? AND d.is_enabled AND d.status='ready' AND d.id IN ("+String.join(",",java.util.Collections.nCopies(ids.size(),"CAST(? AS uuid)"))+")";
    }
    private ReferenceModels.Excerpt excerpt(java.sql.ResultSet row) throws java.sql.SQLException {
        return new ReferenceModels.Excerpt("platform",row.getString("id"),row.getInt("revision"),row.getString("name"),row.getString("kind"),row.getString("chunk_id"),row.getString("text"),row.getInt("page_start"),row.getInt("page_end"));
    }
    private Set<String> terms(String query) {
        Set<String> result=new HashSet<>();
        for(String token:query.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+")) {
            if(token.length()<2) { continue; }
            result.add(token);
            if(token.codePoints().anyMatch(code->Character.UnicodeScript.of(code)==Character.UnicodeScript.HAN)) {
                for(int index=0;index<token.length()-1;index++) { result.add(token.substring(index,index+2)); }
            }
        }
        return result;
    }
    private double score(String text,Set<String> terms) { String lower=text.toLowerCase(Locale.ROOT); return terms.stream().filter(lower::contains).count(); }
    private ReferenceModels.Retrieval result(String status,String message,List<ReferenceModels.Excerpt> input) {
        List<ReferenceModels.Excerpt> selected=new ArrayList<>(); Set<String> seen=new HashSet<>(); int length=0;
        for(var excerpt:input) {
            if(!seen.add(excerpt.text())) { continue; }
            if(selected.size()==6 || length+excerpt.text().length()>4800) { break; }
            selected.add(excerpt); length+=excerpt.text().length();
        }
        return new ReferenceModels.Retrieval(status,message,List.copyOf(selected));
    }
    private record Scored(ReferenceModels.Excerpt excerpt,double score) { }
}
