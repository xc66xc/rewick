package com.interview.copilot.service.impl.references;

import com.interview.copilot.common.references.ReferenceVectorFusion;
import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import com.interview.copilot.entity.references.ReferenceScopeEntity;
import com.interview.copilot.mapper.references.ReferenceHybridMapper;
import com.interview.copilot.service.references.ReferenceVectorService;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Supplier;

@Service
public class ReferenceVectorServiceImpl implements ReferenceVectorService {
    private final ReferenceHybridMapper mapper;
    private final TransactionTemplate transaction;
    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(4, 4, 0, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(32), Thread.ofPlatform().daemon().name("reference-vector-", 0).factory(), new ThreadPoolExecutor.AbortPolicy());
    public ReferenceVectorServiceImpl(ReferenceHybridMapper mapper, PlatformTransactionManager manager) {
        this.mapper = mapper;
        transaction = new TransactionTemplate(manager);
        transaction.setReadOnly(true);
    }
    public List<ReferenceCandidateEntity> search(long user, List<ReferenceScopeEntity> scope,
            String vector, String fingerprint, ReferencePolicy policy) {
        if (scope.isEmpty()) return List.of();
        Future<List<ReferenceCandidateEntity>> questions = null;
        Future<List<ReferenceCandidateEntity>> body = null;
        try {
            questions = executor.submit(() -> query(() -> mapper.questions(user, scope, vector, fingerprint, policy.questionVectorMinScore())));
            body = executor.submit(() -> query(() -> mapper.vector(user, scope, vector, fingerprint, policy.vectorMinScore())));
            return ReferenceVectorFusion.fuse(await(questions), await(body), policy.rrfConstant());
        } finally {
            if (questions != null) questions.cancel(true);
            if (body != null) body.cancel(true);
        }
    }
    private List<ReferenceCandidateEntity> query(Supplier<List<ReferenceCandidateEntity>> action) {
        if (Thread.currentThread().isInterrupted()) throw new java.util.concurrent.CancellationException();
        return transaction.execute(status -> { mapper.timeout("1000"); return action.get(); });
    }
    private List<ReferenceCandidateEntity> await(Future<List<ReferenceCandidateEntity>> future) {
        try { return future.get(2, TimeUnit.SECONDS); }
        catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new java.util.concurrent.CancellationException(); }
        catch (TimeoutException error) { throw new IllegalStateException("问题或正文向量查询超时。", error); }
        catch (ExecutionException error) {
            if (error.getCause() instanceof RuntimeException runtime) throw runtime;
            throw new IllegalStateException("问题或正文向量查询失败。", error);
        }
    }
    @PreDestroy public void close() { executor.shutdownNow(); }
}
