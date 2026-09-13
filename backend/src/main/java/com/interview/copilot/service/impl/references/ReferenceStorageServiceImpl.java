package com.interview.copilot.service.impl.references;

import com.interview.copilot.converter.references.ReferenceDocumentConverter;
import com.interview.copilot.exception.references.ReferenceErrors;
import com.interview.copilot.mapper.references.ReferenceMapper;
import com.interview.copilot.response.references.ReferenceDocumentResponse;
import com.interview.copilot.service.auth.SessionGuardService;
import com.interview.copilot.service.references.ReferenceStorageService;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class ReferenceStorageServiceImpl implements ReferenceStorageService {
    private final ReferenceMapper mapper;
    private final SessionGuardService sessions;

    public ReferenceStorageServiceImpl(ReferenceMapper mapper, SessionGuardService sessions) {
        this.mapper = mapper;
        this.sessions = sessions;
    }

    public List<ReferenceDocumentResponse> list(long user) {
        return mapper.list(user).stream().map(ReferenceDocumentConverter::toResponse).toList();
    }

    public ReferenceDocumentResponse require(long user, String id) {
        var document = mapper.find(user, id);
        if (document == null) {
            throw ReferenceErrors.missing();
        }
        return ReferenceDocumentConverter.toResponse(document);
    }

    public void lockUser(long user) {
        if (sessions.lockUser(user) == null) {
            throw ReferenceErrors.missing();
        }
    }

    @Transactional
    public void insert(long user, String id, String name, String hash, long size) {
        lockUser(user);
        var policy = mapper.policy();
        var totals = mapper.totals(user);
        if (totals.files() >= policy.maxFiles() || totals.bytes() + size > policy.maxTotalBytes()) {
            throw ReferenceErrors.limit();
        }
        mapper.insert(user, id, name, hash, size);
        mapper.enqueue(user, id, 1);
    }

    @Transactional
    public void reindex(long user, String id) {
        lockUser(user);
        require(user, id);
        int revision = mapper.nextRevision(user, id);
        mapper.cancel(id);
        mapper.enqueue(user, id, revision);
    }

    @Transactional
    public void update(long user, String id, Boolean enabled, String kind) {
        require(user, id);
        lockUser(user);
        mapper.update(user, id, enabled, kind);
    }

    @Transactional
    public void delete(long user, String id) {
        lockUser(user);
        require(user, id);
        mapper.delete(user, id);
    }

    public String preview(long user, String id) {
        var document = require(user, id);
        return String.join("\n\n", mapper.preview(user, id, document.revision()));
    }
}
