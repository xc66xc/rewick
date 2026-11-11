package com.interview.copilot.service.impl.references;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.ThrowableProxyUtil;
import ch.qos.logback.core.read.ListAppender;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import com.interview.copilot.exception.ai.ProviderFailure;
import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.model.platform.PlatformConfig;
import com.interview.copilot.model.platform.PlatformPolicy;
import com.interview.copilot.model.platform.PlatformSnapshot;
import com.interview.copilot.model.references.ReferenceRecall;
import com.interview.copilot.util.rerank.BailianRerankClient;
import com.interview.copilot.util.rerank.BailianRerankProtocol;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Map;

class ReferenceRerankDiagnosticsTest {
    private final BailianRerankClient client = mock(BailianRerankClient.class);
    private final ReferenceRerankServiceImpl service = new ReferenceRerankServiceImpl(client);
    private final Logger logger = (Logger) LoggerFactory.getLogger(ReferenceRerankServiceImpl.class);
    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
    private final OperationContext observation = OperationContext.start(1, null, null, "request-test", null,
            "pg", "", event -> {});

    @BeforeEach
    void captureLogs() {
        logs.start();
        logger.addAppender(logs);
    }

    @AfterEach
    void detachLogs() {
        logger.detachAppender(logs);
        logs.stop();
    }

    @Test
    void rank_sensitiveTransportError_logsCorrelatedErrorWithSafeExceptionStack() {
        when(client.rank(any(), any(), any(), anyLong(), any())).thenThrow(
                new IllegalStateException("Bearer private-key private-question private-document",
                        new IllegalArgumentException("upstream-sensitive-body")));

        var result = service.rank("private-question", candidates(), snapshot(), Long.MAX_VALUE, observation);

        assertThat(result.status()).isEqualTo("degraded");
        assertThat(logs.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.ERROR);
            assertThat(event.getFormattedMessage()).contains("[error]", "reason=provider_error",
                    "operationId=" + observation.operationId());
            assertThat(event.getThrowableProxy()).isNotNull();
            assertThat(event.getThrowableProxy().getStackTraceElementProxyArray()).isNotEmpty();
            assertThat(event.getThrowableProxy().getCause()).isNull();
            assertThat(ThrowableProxyUtil.asString(event.getThrowableProxy())).doesNotContain(
                    "private-key", "private-question", "private-document", "upstream-sensitive-body", "Bearer");
        });
    }

    @Test
    void rank_queueFull_logsBoundedWarningWithReasonAndOperationId() {
        when(client.rank(any(), any(), any(), anyLong(), any())).thenThrow(new ProviderFailure("queue_full", "busy"));

        service.rank("private-question", candidates(), snapshot(), Long.MAX_VALUE, observation);

        assertThat(logs.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.WARN);
            assertThat(event.getFormattedMessage()).contains("reason=queue_full", "operationId=" + observation.operationId())
                    .doesNotContain("private-question", "private-document", "private-key");
            assertThat(event.getThrowableProxy()).isNull();
        });
    }

    private List<ReferenceRecall.Fused> candidates() {
        var chunk = new ReferenceCandidateEntity("document", 1, 1, 1, 1, "private-document", 0.8, 0);
        var candidate = new ReferenceRecall.Fused("document", 1, 1, 1, 1, 1, 0.8, 0.8, 0.03, List.of(chunk));
        return List.of(candidate, candidate);
    }

    private PlatformSnapshot snapshot() {
        var provider = new PlatformConfig.Provider("rerank", "Rerank", "rerank",
                "https://provider.invalid" + BailianRerankProtocol.PATH, true, true, null);
        var config = new PlatformConfig(1, List.of(provider), List.of(), "", new PlatformConfig.Asr(false, "", ""),
                null, null, "", new PlatformConfig.Rerank(true, "rerank", "qwen3-rerank", 1500));
        return new PlatformSnapshot(config, Map.of("rerank", "private-key"), PlatformPolicy.from(new ProviderProperties()));
    }
}
