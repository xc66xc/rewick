package com.interview.copilot.service.impl.references;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.interview.copilot.common.references.ReferenceWork;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.service.references.ReferenceCancellationService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.CancellationException;

/** User-scoped cancellation with bounded in-flight work and early-abort tombstones. */
@Service
public class ReferenceCancellationServiceImpl implements ReferenceCancellationService {
    private final ConcurrentHashMap<Key,Entry> active = new ConcurrentHashMap<>();
    private final Semaphore capacity = new Semaphore(32);
    private final Cache<Key,Boolean> cancelled = Caffeine.newBuilder().maximumSize(256).expireAfterWrite(Duration.ofSeconds(30)).build();
    public ReferenceWork register(long user, String requestId) {
        if (!capacity.tryAcquire()) throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,"reference_capacity","资料请求过于频繁，请稍后重试。");
        var key = new Key(user,requestId);
        Thread caller = Thread.currentThread();
        var entry = new Entry(caller);
        if (active.putIfAbsent(key,entry) != null) {
            capacity.release();
            throw new ApiException(HttpStatus.CONFLICT,"reference_duplicate","资料检索请求正在执行。");
        }
        var work = new ReferenceWork(() -> {
            synchronized (entry) {
                entry.closed = true;
                active.remove(key,entry);
                capacity.release();
                Thread.interrupted();
            }
        });
        if (cancelled.getIfPresent(key) != null) { work.close(); throw new CancellationException("资料检索已取消。"); }
        return work;
    }
    public void cancel(long user, String requestId) {
        var key = new Key(user,requestId);
        cancelled.put(key,Boolean.TRUE);
        var entry = active.get(key);
        if (entry != null) synchronized (entry) {
            if (!entry.closed) entry.caller.interrupt();
        }
    }
    private static final class Entry {
        private final Thread caller;
        private boolean closed;
        private Entry(Thread caller) { this.caller = caller; }
    }
    private record Key(long user, String request) {}
}
