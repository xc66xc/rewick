package com.interview.copilot.security.asr;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

/**
 * @author Carl Wang
 * @date 2026-09-20
 * @description 记录转写生命周期与脱敏异常，不记录音频、正文或上游自由文本。
 */
final class AsrDiagnostics {
    private static final Logger LOG = LoggerFactory.getLogger(AsrDiagnostics.class);
    private static final Set<String> SAFE_CODES = Set.of(
            "InvalidParameter", "InvalidApiKey", "InvalidTask", "TaskNotExist",
            "TaskFailed", "InternalError", "RequestTimeout", "Unknown", "Unauthorized",
            "Throttling", "Forbidden", "AllocationQuota.FreeTierOnly", "QuotaExhausted",
            "BadRequest", "InvalidRequest", "AUDIO_TIMEOUT", "CLIENT_ERROR",
            "quota_exceeded", "insufficient_time", "interview_required", "unauthorized",
            "session_revoked", "interview_expired");
    private final long userId;
    private final String connectionId;
    private final long startedNanos = System.nanoTime();
    private final AtomicLong audioBytes = new AtomicLong();
    private final AtomicLong lastAudioNanos = new AtomicLong();
    private final AtomicLong lastEventNanos = new AtomicLong();
    private volatile String requestId = "pending";

    AsrDiagnostics(long userId, String connectionId) {
        this.userId = userId;
        this.connectionId = connectionId;
    }

    void started(String requestId, String upstreamId, int maximumSeconds) {
        this.requestId = requestId;
        LOG.info("ASR start user={} connection={} request={} upstream={} maximumSeconds={}",
                userId, connectionId, requestId, upstreamId, maximumSeconds);
    }

    void audio(int bytes) {
        audioBytes.addAndGet(bytes);
        lastAudioNanos.set(System.nanoTime());
    }

    void event() {
        lastEventNanos.set(System.nanoTime());
    }

    void detail(String reason, String code, Throwable error) {
        LOG.warn("ASR detail user={} connection={} request={} reason={} code={} exception={} cause={}",
                userId, connectionId, requestId, reason, safeCode(code),
                error == null ? "none" : error.getClass().getSimpleName(),
                error == null || error.getCause() == null ? "none" : error.getCause().getClass().getSimpleName());
    }

    void closed(String side, int code) {
        LOG.info("ASR transport close user={} connection={} request={} side={} closeCode={}",
                userId, connectionId, requestId, side, code);
    }

    void ended(String phase, String outcome, String reason) {
        long now = System.nanoTime();
        LOG.info("ASR end user={} connection={} request={} phase={} outcome={} reason={} elapsedMs={} audioBytes={} lastAudioAgoMs={} lastEventAgoMs={}",
                userId, connectionId, requestId, phase, outcome, reason,
                (now - startedNanos) / 1_000_000, audioBytes.get(),
                age(now, lastAudioNanos.get()), age(now, lastEventNanos.get()));
    }

    static String safeCode(String code) {
        return SAFE_CODES.contains(code == null ? "" : code) ? code : "unrecognized_or_absent";
    }

    private static long age(long now, long previous) {
        return previous == 0 ? -1 : (now - previous) / 1_000_000;
    }
}
