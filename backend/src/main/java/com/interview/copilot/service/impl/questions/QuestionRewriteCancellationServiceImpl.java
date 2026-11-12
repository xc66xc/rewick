package com.interview.copilot.service.impl.questions;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.interview.copilot.common.questions.QuestionRewriteWork;
import com.interview.copilot.service.questions.QuestionRewriteCancellationService;
import org.springframework.stereotype.Service;
import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;

@Service
public final class QuestionRewriteCancellationServiceImpl implements QuestionRewriteCancellationService {
    private final ConcurrentHashMap<Key, QuestionRewriteWork> active = new ConcurrentHashMap<>();
    private final Semaphore capacity = new Semaphore(4);
    private final Cache<Key, Boolean> cancelled = Caffeine.newBuilder().maximumSize(256)
            .expireAfterWrite(Duration.ofSeconds(30)).build();

    public Optional<QuestionRewriteWork> register(long user, String requestId) {
        var key = new Key(user, requestId);
        if (cancelled.getIfPresent(key) != null) throw new CancellationException("Question rewrite cancelled");
        if (!capacity.tryAcquire()) return Optional.empty();
        var work = new QuestionRewriteWork(() -> {
            active.remove(key);
            capacity.release();
        });
        if (active.putIfAbsent(key, work) != null) {
            capacity.release();
            return Optional.empty();
        }
        if (cancelled.getIfPresent(key) != null) work.cancel();
        return Optional.of(work);
    }

    public void cancel(long user, String requestId) {
        var key = new Key(user, requestId);
        cancelled.put(key, Boolean.TRUE);
        var work = active.get(key);
        if (work != null) work.cancel();
    }

    private record Key(long user, String requestId) {}
}
