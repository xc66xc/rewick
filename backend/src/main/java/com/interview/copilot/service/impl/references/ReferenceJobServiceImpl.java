package com.interview.copilot.service.impl.references;

import com.interview.copilot.exception.references.ReferenceErrors;
import com.interview.copilot.mapper.references.ReferenceMapper;
import com.interview.copilot.model.references.ReferenceModels;
import com.interview.copilot.service.references.ReferenceJobService;
import com.interview.copilot.service.references.ReferenceStorageService;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class ReferenceJobServiceImpl implements ReferenceJobService {
    private final ReferenceStorageService repository;
    private final ReferenceMapper mapper;

    public ReferenceJobServiceImpl(ReferenceStorageService repository, ReferenceMapper mapper) {
        this.repository = repository;
        this.mapper = mapper;
    }

    public ReferenceModels.Job claim() {
        return mapper.claim(UUID.randomUUID().toString());
    }

    public boolean renew(ReferenceModels.Job job) {
        return mapper.renew(job) == 1;
    }

    public void indexing(ReferenceModels.Job job) {
        mapper.indexing(job);
    }

    @Transactional
    public void publish(
            ReferenceModels.Job job,
            ReferenceModels.Parsed parsed,
            List<List<Double>> vectors,
            String fingerprint) {
        repository.lockUser(job.userId());
        if (!renew(job)) {
            return;
        }
        Integer revision = mapper.desiredRevision(job);
        if (revision == null || revision != job.revision()) {
            return;
        }
        if (mapper.otherChunks(job) + parsed.chunks().size() > mapper.policy().maxChunks()) {
            throw ReferenceErrors.limit();
        }
        mapper.deleteChunks(job.documentId());
        for (int i = 0; i < parsed.chunks().size(); i++) {
            long id = mapper.insertChunk(job, parsed.chunks().get(i));
            mapper.insertEmbedding(id, job.userId(), fingerprint, vectors.get(i).toString());
        }
        mapper.ready(job, parsed, parsed.chunks().size());
        mapper.complete(job, vectors.size());
    }

    @Transactional
    public void fail(ReferenceModels.Job job, String error) {
        repository.lockUser(job.userId());
        if (!renew(job)) {
            return;
        }
        mapper.failJob(job, error);
        mapper.failDocument(job, error);
    }
}
