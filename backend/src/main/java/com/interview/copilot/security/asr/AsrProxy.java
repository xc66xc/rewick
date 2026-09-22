package com.interview.copilot.security.asr;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.service.asr.AsrSessionService;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.exception.ai.ProviderErrors;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.platform.DesktopSettingsService;
import com.interview.copilot.service.platform.PlatformRuntimeService;
import com.interview.copilot.service.usage.UsageService;
import com.interview.copilot.util.ai.ProviderJson;

import jakarta.annotation.PreDestroy;

import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.AbstractWebSocketHandler;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;

/**
 * @author Carl Wang
 * @date 2026-09-20
 * @description 管理平台转写连接及脱敏连接诊断。
 */
@Component
public class AsrProxy extends AbstractWebSocketHandler {
    private final DesktopSettingsService desktop;
    private final PlatformRuntimeService providers;
    private final ProviderJson json;
    private final UsageService usage;
    private final AsrSessionService sessionService;
    private final ConcurrentHashMap<String, AsrBridge> sessions = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Long, String> users = new ConcurrentHashMap<>();
    private final HttpClient client =
            HttpClient.newBuilder()
                    .followRedirects(HttpClient.Redirect.NEVER)
                    .connectTimeout(Duration.ofSeconds(10))
                    .build();
    private final ScheduledExecutorService timers =
            Executors.newScheduledThreadPool(
                    2, Thread.ofPlatform().daemon().name("asr-deadline-", 0).factory());

    public AsrProxy(
            PlatformRuntimeService providers,
            ProviderJson json,
            UsageService usage,
            AsrSessionService sessionService,
            DesktopSettingsService desktop) {
        this.desktop = desktop;
        this.providers = providers;
        this.json = json;
        this.usage = usage;
        this.sessionService = sessionService;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws java.io.IOException {
        UserPrincipal user = principal(session.getPrincipal());
        if (user == null
                || !available(user.id(), session.getUri())
                || users.putIfAbsent(user.id(), session.getId()) != null) {
            org.slf4j.LoggerFactory.getLogger(AsrProxy.class).warn(
                    "ASR connection rejected user={} reason=authentication_service_or_concurrency",
                    user == null ? null : user.id());
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }
        session.setTextMessageSizeLimit(8192);
        session.setBinaryMessageSizeLimit(65536);
        AsrBridge bridge =
                new AsrBridge(
                        session,
                        user,
                        this,
                        () -> {
                            sessions.remove(session.getId());
                            users.remove(user.id(), session.getId());
                        });
        sessions.put(session.getId(), bridge);
    }

    public static UserPrincipal principal(java.security.Principal principal) {
        if (principal instanceof Authentication auth
                && auth.getPrincipal() instanceof UserPrincipal user) {
            return user;
        }
        return principal instanceof UserPrincipal user ? user : null;
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        AsrBridge bridge = sessions.get(session.getId());
        if (bridge != null) {
            bridge.text(message.getPayload());
        }
    }

    @Override
    protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) {
        AsrBridge bridge = sessions.get(session.getId());
        if (bridge != null) {
            bridge.binary(message.getPayload());
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        AsrBridge bridge = sessions.get(session.getId());
        if (bridge != null) {
            bridge.transportClosed("downstream", status.getCode());
        }
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        AsrBridge bridge = sessions.get(session.getId());
        if (bridge != null) {
            org.slf4j.LoggerFactory.getLogger(AsrProxy.class).warn(
                    "ASR downstream transport error connection={} exception={}",
                    session.getId(), exception.getClass().getSimpleName());
            bridge.close("cancel");
        }
    }

    public ProviderProperties.Asr config(long user, URI uri) {
        return providers.snapshot().asr(desktop.asr(user, AsrServiceSelection.from(uri)));
    }

    public void checkAvailable(long user, URI uri) {
        if (!config(user, uri).isEnabled()) {
            throw ProviderErrors.unavailable();
        }
    }

    private boolean available(long user, URI uri) {
        try {
            return config(user, uri).isEnabled();
        } catch (ApiException exception) {
            return false;
        }
    }

    public JsonNode withHotwords(long user, String sessionId, String model, JsonNode frame) {
        return sessionService.withHotwords(user, sessionId, model, frame);
    }

    public ProviderJson json() {
        return json;
    }

    public UsageService usage() {
        return usage;
    }

    public HttpClient client() {
        return client;
    }

    public ScheduledExecutorService timers() {
        return timers;
    }

    public int maximumSeconds(ProviderProperties.Asr config) {
        return sessionService.maximumSeconds(config.getMaxDurationSeconds());
    }

    @PreDestroy
    public void shutdown() {
        sessions.values().forEach(bridge -> bridge.close("cancel"));
        timers.shutdownNow();
        client.shutdownNow();
    }
}
