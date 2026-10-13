package com.interview.copilot.job.references;

import com.interview.copilot.common.references.PlatformEmbeddingClient;
import com.interview.copilot.common.references.ReferenceFiles;
import com.interview.copilot.common.references.ReferenceParser;
import com.interview.copilot.exception.references.ReferenceErrors;
import com.interview.copilot.model.references.ReferenceModels;
import com.interview.copilot.service.references.ReferenceJobService;
import com.interview.copilot.service.references.ReferenceStorageService;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

@Component
@EnableScheduling
public class ReferenceIndexer {
    private static final Logger LOG = LoggerFactory.getLogger(ReferenceIndexer.class);
    private final ReferenceJobService jobs;
    private final ReferenceStorageService repository;
    private final ReferenceFiles files;
    private final ReferenceParser parser;
    private final PlatformEmbeddingClient embedding;

    public ReferenceIndexer(
            ReferenceJobService jobs,
            ReferenceStorageService repository,
            ReferenceFiles files,
            ReferenceParser parser,
            PlatformEmbeddingClient embedding) {
        this.jobs = jobs;
        this.repository = repository;
        this.files = files;
        this.parser = parser;
        this.embedding = embedding;
    }

    @Scheduled(fixedDelay = 2000, initialDelay = 5000)
    public void poll() {
        jobs.cleanup();
        ReferenceModels.Job job = jobs.claim();
        if (job != null) {
            process(job);
        }
    }

    public void process(ReferenceModels.Job job) {
        try {
            var document = repository.require(job.userId(), job.documentId());
            jobs.indexing(job);
            var parsed = parser.parse(files.path(job.documentId()), document.name(), com.interview.copilot.common.references.ReferenceIndexPolicy.read(job));
            var selection = embedding.selection();
            if (!jobs.prepare(job, parsed)) return;
            for (int offset = 0; offset < parsed.chunks().size(); offset += 10) {
                if (!jobs.renew(job)) {
                    return;
                }
                var texts =
                        parsed
                                .chunks()
                                .subList(offset, Math.min(offset + 10, parsed.chunks().size()))
                                .stream()
                                .map(ReferenceModels.Chunk::text)
                                .toList();
                var batch = parsed.chunks().subList(offset, Math.min(offset + 10, parsed.chunks().size()));
                if (!jobs.stage(job, batch, embedding.embed(selection, texts), selection.fingerprint())) return;
            }
            if (!selection.fingerprint().equals(embedding.selection().fingerprint())) {
                throw ReferenceErrors.invalid("平台向量模型已变更，请重建资料。");
            }
            jobs.publish(job, parsed, selection.fingerprint());
        } catch (IOException | RuntimeException error) {
            LOG.error(
                    "Reference index failed job={} document={} exceptionType={}",
                    job.id(),
                    job.documentId(),
                    error.getClass().getSimpleName());
            jobs.fail(job, "资料处理失败，请检查平台向量服务或文件内容后重试。");
        }
    }
}
