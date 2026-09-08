package com.interview.copilot.ai;

import com.interview.copilot.usage.UsageLease;
import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import reactor.core.Disposable;
import reactor.core.publisher.Flux;
import reactor.core.scheduler.Schedulers;

/** Small Reactor prefetch and synchronous emitter writes bound slow-consumer buffering. */
final class LlmStreamSession {
    private static final String HEARTBEAT = ":platform-heartbeat";
    private final SseEmitter emitter;
    private final UsageLease lease;
    private final LlmConcurrency.Permit permit;
    private final AtomicBoolean ended = new AtomicBoolean();
    private final AtomicBoolean done = new AtomicBoolean();
    private final AtomicReference<Disposable> subscription = new AtomicReference<>();

    LlmStreamSession(UsageLease lease, LlmConcurrency.Permit permit, long timeoutMillis) {
        this.lease = lease;
        this.permit = permit;
        emitter = new SseEmitter(timeoutMillis + 1000);
        emitter.onCompletion(() -> terminate("cancel"));
        emitter.onTimeout(() -> terminate("fail"));
        emitter.onError(error -> terminate("cancel"));
    }

    SseEmitter start(Flux<String> source) {
        Flux<String> heartbeats = Flux.interval(Duration.ofSeconds(5)).map(sequence -> HEARTBEAT);
        Disposable active = source.mergeWith(heartbeats).takeUntil("[DONE]"::equals)
                .publishOn(Schedulers.boundedElastic(), 8).subscribe(this::send, this::fail, this::complete);
        subscription.set(active);
        if (ended.get()) { active.dispose(); }
        return emitter;
    }

    private void send(String data) {
        if (ended.get()) { return; }
        try {
            if (HEARTBEAT.equals(data)) { emitter.send(SseEmitter.event().comment("keepalive")); }
            else { emitter.send(SseEmitter.event().data(data)); }
            if ("[DONE]".equals(data)) { done.set(true); }
        } catch (IOException | IllegalStateException exception) {
            terminate("cancel");
        }
    }

    private void fail(Throwable error) {
        if (ended.get()) { return; }
        try {
            emitter.send(SseEmitter.event().data(Map.of("error", Map.of(
                    "code", "PROVIDER_UNAVAILABLE", "message", "回答服务中断，请稍后重试"))));
        } catch (IOException | IllegalStateException exception) {
            terminate("cancel");
            return;
        }
        terminate("fail");
    }

    private void complete() { terminate(done.get() ? "complete" : "fail"); }

    private void terminate(String outcome) {
        if (!ended.compareAndSet(false, true)) { return; }
        Disposable active = subscription.get();
        if (active != null) { active.dispose(); }
        try {
            switch (outcome) {
                case "complete" -> lease.complete();
                case "fail" -> lease.fail();
                default -> lease.cancel();
            }
        } catch (RuntimeException exception) {
            org.slf4j.LoggerFactory.getLogger(LlmStreamSession.class).error("LLM usage finalization failed");
        } finally {
            permit.close();
            emitter.complete();
        }
    }
}
