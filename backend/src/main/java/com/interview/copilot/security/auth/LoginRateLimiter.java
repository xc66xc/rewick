package com.interview.copilot.security.auth;

import com.interview.copilot.config.AuthProperties;
import com.interview.copilot.exception.ApiException;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.locks.ReentrantLock;

@Component
public class LoginRateLimiter {
    private static final int MAX_BUCKETS = 10000;
    private final Map<String, Window> buckets = new HashMap<>();
    private final ReentrantLock lock = new ReentrantLock();
    private final AuthProperties properties;
    private final Clock clock;

    public LoginRateLimiter(AuthProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
    }

    public void acquire(String address, String identifier) {
        lock.lock();
        try {
            long now = clock.millis();
            buckets.entrySet().removeIf(entry -> entry.getValue().expiresAt <= now);
            consume("ip:" + address, properties.loginBurst() * 10, now);
            consume(
                    "user:" + identifier.strip().toLowerCase(Locale.ROOT),
                    properties.loginBurst(),
                    now);
        } finally {
            lock.unlock();
        }
    }

    private void consume(String key, int maximum, long now) {
        Window previous = buckets.get(key);
        if (previous == null && buckets.size() >= MAX_BUCKETS) throw limited();
        int count = previous == null ? 0 : previous.count;
        if (count >= maximum) throw limited();
        long expiry =
                previous == null
                        ? now + properties.loginWindowSeconds() * 1000L
                        : previous.expiresAt;
        buckets.put(key, new Window(count + 1, expiry));
    }

    private ApiException limited() {
        return new ApiException(
                HttpStatus.TOO_MANY_REQUESTS, "login_rate_limited", "登录尝试过于频繁，请稍后重试。");
    }

    private record Window(int count, long expiresAt) {}
}
