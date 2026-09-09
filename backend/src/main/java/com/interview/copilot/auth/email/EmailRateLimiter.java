package com.interview.copilot.auth.email;

import java.time.Clock;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.locks.ReentrantLock;
import org.springframework.stereotype.Component;

@Component
public class EmailRateLimiter {
    private static final int MAXIMUM_BUCKETS = 10000;
    private final Map<String, Window> buckets = new HashMap<>();
    private final ReentrantLock lock = new ReentrantLock();
    private final EmailAuthProperties policy;
    private final Clock clock;

    public EmailRateLimiter(EmailAuthProperties policy, Clock clock) { this.policy = policy; this.clock = clock; }
    public void send(String address) { consume("send:" + address, policy.ipHourlySendLimit(), 3600); }
    public void register(String address) { consume("register:" + address, policy.ipRegistrationLimit(), 60); }

    private void consume(String key, int maximum, int seconds) {
        lock.lock();
        try {
            long now = clock.millis();
            buckets.entrySet().removeIf(entry -> entry.getValue().expiresAt() <= now);
            Window previous = buckets.get(key);
            if (previous == null && buckets.size() >= MAXIMUM_BUCKETS) throw EmailErrors.limited();
            int count = previous == null ? 0 : previous.count();
            if (count >= maximum) throw EmailErrors.limited();
            buckets.put(key, new Window(count + 1, previous == null ? now + seconds * 1000L : previous.expiresAt()));
        } finally { lock.unlock(); }
    }

    private record Window(int count, long expiresAt) {}
}
