package com.interview.copilot.asr;

import com.interview.copilot.ai.ProviderErrors;
import com.interview.copilot.ai.ProviderJson;
import com.interview.copilot.ai.ProviderProperties;
import com.interview.copilot.auth.UserPrincipal;
import com.interview.copilot.config.PlatformLimitsProperties;
import com.interview.copilot.usage.UsageService;
import jakarta.annotation.PreDestroy;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.AbstractWebSocketHandler;

@Component
public class AsrProxy extends AbstractWebSocketHandler {
    private final ProviderProperties properties;
    private final ProviderJson json;
    private final UsageService usage;
    private final PlatformLimitsProperties limits;
    private final ConcurrentHashMap<String, AsrBridge> sessions = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Long, String> users = new ConcurrentHashMap<>();
    private final HttpClient client = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER)
            .connectTimeout(Duration.ofSeconds(10)).build();
    private final ScheduledExecutorService timers = Executors.newScheduledThreadPool(2,
            Thread.ofPlatform().daemon().name("asr-deadline-", 0).factory());

    public AsrProxy(ProviderProperties properties, ProviderJson json, UsageService usage, PlatformLimitsProperties limits) {
        this.properties = properties;
        this.json = json;
        this.usage = usage;
        this.limits = limits;
    }

    @Override public void afterConnectionEstablished(WebSocketSession session) throws java.io.IOException {
        UserPrincipal user = principal(session.getPrincipal());
        if (user == null || !config().isEnabled() || users.putIfAbsent(user.id(), session.getId()) != null) {
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }
        session.setTextMessageSizeLimit(8192);
        session.setBinaryMessageSizeLimit(65536);
        AsrBridge bridge = new AsrBridge(session, user, this, () -> {
            sessions.remove(session.getId());
            users.remove(user.id(), session.getId());
        });
        sessions.put(session.getId(), bridge);
    }

    public static UserPrincipal principal(java.security.Principal principal) {
        if (principal instanceof Authentication auth && auth.getPrincipal() instanceof UserPrincipal user) { return user; }
        return principal instanceof UserPrincipal user ? user : null;
    }

    @Override protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        AsrBridge bridge = sessions.get(session.getId());
        if (bridge != null) { bridge.text(message.getPayload()); }
    }

    @Override protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) {
        AsrBridge bridge = sessions.get(session.getId());
        if (bridge != null) { bridge.binary(message.getPayload()); }
    }

    @Override public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        AsrBridge bridge = sessions.get(session.getId());
        if (bridge != null) { bridge.close("cancel"); }
    }

    @Override public void handleTransportError(WebSocketSession session, Throwable exception) {
        AsrBridge bridge = sessions.get(session.getId());
        if (bridge != null) { bridge.close("cancel"); }
    }

    public void checkAvailable() { if (!config().isEnabled()) { throw ProviderErrors.unavailable(); } }
    ProviderProperties.Asr config() { return properties.getAsr(); }
    ProviderJson json() { return json; }
    UsageService usage() { return usage; }
    HttpClient client() { return client; }
    ScheduledExecutorService timers() { return timers; }
    int maximumSeconds() { return Math.min(config().getMaxDurationSeconds(), limits.maxAsrSessionSeconds()); }

    @PreDestroy public void shutdown() {
        sessions.values().forEach(bridge -> bridge.close("cancel"));
        timers.shutdownNow();
        client.shutdownNow();
    }
}
