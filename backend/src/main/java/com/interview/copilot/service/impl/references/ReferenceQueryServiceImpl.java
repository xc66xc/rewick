package com.interview.copilot.service.impl.references;

import com.interview.copilot.mapper.references.ReferenceMapper;
import com.interview.copilot.model.platform.PlatformSnapshot;
import com.interview.copilot.model.references.ReferenceQueryPlan;
import com.interview.copilot.service.platform.PlatformRuntimeService;
import com.interview.copilot.service.references.ReferenceQueryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import java.util.concurrent.CancellationException;
import java.util.concurrent.TimeUnit;

@Service
public class ReferenceQueryServiceImpl implements ReferenceQueryService {
    private static final Logger LOG = LoggerFactory.getLogger(ReferenceQueryServiceImpl.class);
    private final ReferenceMapper mapper;
    private final PlatformRuntimeService platform;
    private final com.interview.copilot.mapper.references.ReferenceHybridMapper hybrid;

    public ReferenceQueryServiceImpl(ReferenceMapper mapper, PlatformRuntimeService platform,
            com.interview.copilot.mapper.references.ReferenceHybridMapper hybrid) {
        this.mapper = mapper;
        this.platform = platform;
        this.hybrid = hybrid;
    }
    public ReferenceQueryPlan prepare() {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(28);
        var policy = mapper.policy();
        return new ReferenceQueryPlan(policy, snapshot(), deadline, deadline - TimeUnit.MILLISECONDS.toNanos(1500));
    }
    public java.util.List<com.interview.copilot.entity.references.ReferenceScopeEntity> scope(
            long user, java.util.List<String> ids, ReferenceQueryPlan plan) {
        // The mapper has a one-second JDBC timeout; avoid another SQL solely to set a timeout.
        if (ids.isEmpty() || ReferenceQueryPlan.remainingNanos(plan.deadlineNanos()) < TimeUnit.SECONDS.toNanos(1)) return java.util.List.of();
        return hybrid.scope(user, ids);
    }
    private PlatformSnapshot snapshot() {
        ReferenceQueryPlan.checkCancellation();
        try { return platform.snapshot(); }
        catch (RuntimeException error) {
            if (error instanceof CancellationException || Thread.currentThread().isInterrupted()) throw new CancellationException();
            LOG.error("Reference provider configuration could not be frozen; keyword recall remains available", error);
            return null;
        }
    }
}
