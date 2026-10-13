package com.interview.copilot.service.impl.references;

import com.interview.copilot.common.references.ReferenceAnalyzer;
import com.interview.copilot.common.references.ReferenceIndexPolicy;
import com.interview.copilot.exception.references.ReferenceErrors;
import com.interview.copilot.mapper.references.ReferenceMapper;
import com.interview.copilot.mapper.references.ReferenceIndexMapper;
import com.interview.copilot.model.references.ReferenceModels;
import com.interview.copilot.service.references.ReferenceJobService;
import com.interview.copilot.service.references.ReferenceStorageService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

@Service
public class ReferenceJobServiceImpl implements ReferenceJobService {
    private final ReferenceStorageService repository;
    private final ReferenceMapper mapper;
    private final ReferenceIndexMapper index;
    private final ReferenceAnalyzer analyzer;
    private final com.interview.copilot.service.references.ReferenceContextService contexts;
    public ReferenceJobServiceImpl(ReferenceStorageService repository, ReferenceMapper mapper,
            ReferenceIndexMapper index, ReferenceAnalyzer analyzer, com.interview.copilot.service.references.ReferenceContextService contexts) {
        this.repository = repository;
        this.mapper = mapper;
        this.index = index;
        this.analyzer = analyzer;
        this.contexts = contexts;
    }
    public ReferenceModels.Job claim() { return mapper.claim(UUID.randomUUID().toString()); }
    public boolean renew(ReferenceModels.Job job) { return mapper.renew(job) == 1; }
    public void indexing(ReferenceModels.Job job) { mapper.indexing(job); }
    private boolean current(ReferenceModels.Job job) {
        repository.lockUser(job.userId());
        if (!renew(job)) return false;
        Integer revision = mapper.desiredRevision(job);
        return revision != null && revision == job.revision();
    }
    @Transactional
    public boolean prepare(ReferenceModels.Job job, ReferenceModels.Parsed parsed) {
        if (!current(job)) return false;
        var policy = ReferenceIndexPolicy.read(job);
        if (mapper.otherChunks(job) + parsed.chunks().size() > policy.maxChunks()) throw ReferenceErrors.limit();
        index.clearStaging(job);
        if (index.totalContexts(job.userId()) + parsed.contexts().size() > 50000
                || index.totalSections(job.userId()) + parsed.sections().size() > 50000) throw ReferenceErrors.limit();
        long bytes = parsed.sections().stream().mapToLong(s -> s.introduction().getBytes(StandardCharsets.UTF_8).length).sum()
                + parsed.contexts().stream().mapToLong(c -> c.text().getBytes(StandardCharsets.UTF_8).length).sum()
                + parsed.chunks().stream().mapToLong(c -> c.text().getBytes(StandardCharsets.UTF_8).length).sum();
        long source = parsed.sections().stream().mapToLong(s -> s.introduction().getBytes(StandardCharsets.UTF_8).length).sum();
        if (bytes > source * 6 + 1048576) throw ReferenceErrors.limit();
        for (var section : parsed.sections()) index.section(job, section);
        for (var context : parsed.contexts()) index.context(job, context);
        return true;
    }
    @Transactional
    public boolean stage(ReferenceModels.Job job, List<ReferenceModels.Chunk> chunks, List<List<Double>> vectors, String fingerprint) {
        if (!current(job)) return false;
        if (chunks.size() != vectors.size()) throw ReferenceErrors.invalid("资料向量数量不一致。");
        for (int i = 0; i < chunks.size(); i++) {
            var chunk = chunks.get(i);
            var terms = analyzer.frequencies(chunk.text());
            int length = terms.values().stream().mapToInt(Integer::intValue).sum();
            long id = index.chunk(job, chunk, length);
            if (!terms.isEmpty()) index.terms(job, id, terms);
            mapper.insertEmbedding(id, job.userId(), fingerprint, vectors.get(i).toString());
        }
        if (index.totalTerms(job.userId()) > ReferenceIndexPolicy.read(job).maxTermRows()
                || index.documentTerms(job.documentId()) > 400000) throw ReferenceErrors.limit();
        return true;
    }
    @Transactional
    public void publish(ReferenceModels.Job job, ReferenceModels.Parsed parsed, String fingerprint) {
        if (!current(job)) return;
        if (index.completeCount(job, fingerprint) != parsed.chunks().size()) throw ReferenceErrors.invalid("资料索引未构建完整。");
        index.statistics(job);
        index.activate(job, parsed, parsed.chunks().size(), parsed.contexts().size(), parsed.sections().size());
        mapper.complete(job, parsed.chunks().size());
        contexts.invalidate(job.userId(), job.documentId());
    }
    @Transactional
    public void fail(ReferenceModels.Job job, String error) {
        if (!current(job)) return;
        mapper.failJob(job, error);
        mapper.failDocument(job, error);
    }
    @Transactional
    public void cleanup() {
        for (var target : index.cleanupTargets()) {
            if (mapper.lockUser(target.userId()) == null) continue;
            index.cleanup(target.userId(), target.documentId());
            index.cleanupStatistics(target.userId(), target.documentId());
            index.cleaned(target.userId(), target.documentId());
        }
    }
}
