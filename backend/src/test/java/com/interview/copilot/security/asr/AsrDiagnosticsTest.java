package com.interview.copilot.security.asr;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * @author Carl Wang
 * @date 2026-09-20
 * @description 验证转写诊断可关联且不会输出上游敏感文本。
 */
class AsrDiagnosticsTest {
    @Test
    void lifecycle_sensitiveError_omitsTextAndRetainsCorrelation() {
        Logger logger = (Logger) LoggerFactory.getLogger(AsrDiagnostics.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            AsrDiagnostics diagnostics = new AsrDiagnostics(42, "connection-1");
            diagnostics.started("request-1", "upstream-1", 3600);
            diagnostics.audio(3200);
            diagnostics.event();
            diagnostics.detail("upstream_task_failed", "Bearer secret-key\nprivate transcript",
                    new IllegalStateException("secret-key private transcript"));
            diagnostics.closed("upstream", 1008);
            diagnostics.ended("running", "fail", "upstream_task_failed");
            String output = appender.list.stream().map(ILoggingEvent::getFormattedMessage)
                    .reduce("", (left, right) -> left + "\n" + right);
            assertThat(output).contains("user=42", "request=request-1", "audioBytes=3200",
                    "closeCode=1008", "reason=upstream_task_failed", "exception=IllegalStateException")
                    .doesNotContain("secret-key", "private transcript", "Bearer");
            assertThat(appender.list).allMatch(event -> event.getThrowableProxy() == null);
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
    }

    @Test
    void safeCode_knownProviderError_preservesDiagnosticCode() {
        assertThat(AsrDiagnostics.safeCode("AllocationQuota.FreeTierOnly"))
                .isEqualTo("AllocationQuota.FreeTierOnly");
        assertThat(AsrDiagnostics.safeCode(null)).isEqualTo("unrecognized_or_absent");
    }
}
