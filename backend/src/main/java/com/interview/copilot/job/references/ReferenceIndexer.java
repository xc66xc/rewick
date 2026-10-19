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
        var stage = new java.util.concurrent.atomic.AtomicReference<>("load");
        try {
            var document = repository.require(job.userId(), job.documentId());
            jobs.indexing(job);
            stage.set("parse");
            var parsed = parser.parse(files.path(job.documentId()), document.name(), com.interview.copilot.common.references.ReferenceIndexPolicy.read(job));
            stage.set("configuration");
            var selection = embedding.selection();
            stage.set("prepare");
            if (!jobs.prepare(job, parsed) || !buildBatches(job, parsed, selection, stage) || !buildQuestions(job, parsed, selection, stage)) return;
            stage.set("configuration");
            if (!selection.fingerprint().equals(embedding.selection().fingerprint()))
                throw ReferenceErrors.invalid("平台向量模型已变更，请重建资料。");
            stage.set("publish");
            jobs.publish(job, parsed, selection.fingerprint());
        } catch (IOException | RuntimeException error) {
            fail(job, stage.get(), error);
        }
    }

    private boolean buildBatches(ReferenceModels.Job job, ReferenceModels.Parsed parsed,
            PlatformEmbeddingClient.Selection selection, java.util.concurrent.atomic.AtomicReference<String> stage) {
        for (int offset = 0; offset < parsed.chunks().size(); offset += 10) {
            if (!jobs.renew(job)) return false;
            var batch = parsed.chunks().subList(offset, Math.min(offset + 10, parsed.chunks().size()));
            var texts = batch.stream().map(ReferenceModels.Chunk::text).toList();
            stage.set("embedding");
            var vectors = embedding.embed(selection, texts);
            stage.set("write");
            if (!jobs.stage(job, batch, vectors, selection.fingerprint())) return false;
        }
        return true;
    }

    private boolean buildQuestions(ReferenceModels.Job job, ReferenceModels.Parsed parsed,
            PlatformEmbeddingClient.Selection selection, java.util.concurrent.atomic.AtomicReference<String> stage) {
        var questions = parsed.sections().stream().filter(s -> !s.questionText().isBlank()).toList();
        for (int offset = 0; offset < questions.size(); offset += 10) {
            if (!jobs.renew(job)) return false;
            var batch = questions.subList(offset, Math.min(offset + 10, questions.size()));
            stage.set("embedding");
            var vectors = embedding.embed(selection, batch.stream().map(ReferenceModels.Section::questionText).toList());
            stage.set("write");
            if (!jobs.stageQuestions(job, batch, vectors, selection.fingerprint())) return false;
        }
        return true;
    }

    private void fail(ReferenceModels.Job job, String stage, Throwable error) {
        String reason = error instanceof com.interview.copilot.exception.ai.ProviderFailure failure
                ? failure.reason() : error.getClass().getSimpleName();
        int upstreamStatus = error instanceof com.interview.copilot.exception.ai.ProviderFailure failure
                ? failure.upstreamStatus() : 0;
        var diagnostic = new IllegalStateException("Reference index failure: " + stage + " / " + reason);
        diagnostic.setStackTrace(error.getStackTrace());
        LOG.error("Reference index failed job={} document={} stage={} reason={} upstreamStatus={}",
                job.id(), job.documentId(), stage, reason, upstreamStatus, diagnostic);
        jobs.fail(job, com.interview.copilot.common.references.ReferenceIndexFailure.message(stage, error));
    }
}
