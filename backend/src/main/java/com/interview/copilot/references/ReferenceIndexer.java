package com.interview.copilot.references;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@EnableScheduling
public class ReferenceIndexer {
    private static final Logger LOG=LoggerFactory.getLogger(ReferenceIndexer.class);
    private final ReferenceJobs jobs;
    private final ReferenceRepository repository;
    private final ReferenceFiles files;
    private final ReferenceParser parser;
    private final PlatformEmbeddingClient embedding;
    public ReferenceIndexer(ReferenceJobs jobs,ReferenceRepository repository,ReferenceFiles files,ReferenceParser parser,PlatformEmbeddingClient embedding) {
        this.jobs=jobs; this.repository=repository; this.files=files; this.parser=parser; this.embedding=embedding;
    }
    @Scheduled(fixedDelay=2000,initialDelay=5000)
    public void poll() {
        ReferenceModels.Job job=jobs.claim();
        if(job!=null) { process(job); }
    }
    public void process(ReferenceModels.Job job) {
        try {
            var document=repository.require(job.userId(),job.documentId());
            jobs.indexing(job);
            var parsed=parser.parse(files.path(job.documentId()),document.name());
            var selection=embedding.selection();
            List<List<Double>> vectors=new ArrayList<>();
            for(int offset=0;offset<parsed.chunks().size();offset+=10) {
                if(!jobs.renew(job)) { return; }
                var texts=parsed.chunks().subList(offset,Math.min(offset+10,parsed.chunks().size())).stream().map(ReferenceModels.Chunk::text).toList();
                vectors.addAll(embedding.embed(selection,texts));
            }
            if(!selection.fingerprint().equals(embedding.selection().fingerprint())) { throw ReferenceErrors.invalid("平台向量模型已变更，请重建资料。"); }
            jobs.publish(job,parsed,vectors,selection.fingerprint());
        } catch(IOException | RuntimeException error) {
            LOG.error("Reference index failed job={} document={} exceptionType={}",job.id(),job.documentId(),error.getClass().getSimpleName());
            jobs.fail(job,"资料处理失败，请检查平台向量服务或文件内容后重试。");
        }
    }
}
