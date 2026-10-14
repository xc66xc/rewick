package com.interview.copilot.util.ai;

import org.junit.jupiter.api.Test;
import java.net.UnknownHostException;
import java.util.concurrent.TimeoutException;
import static org.assertj.core.api.Assertions.assertThat;

class ProviderFailureClassifierTest {
    @Test void classify_timeout_doesNotExposeThrowableMessage() {
        var failure=ProviderFailureClassifier.classify(new TimeoutException("private text and key"));
        assertThat(failure.reason()).isEqualTo("timeout");
        assertThat(failure.getMessage()).doesNotContain("private text","key");
        assertThat(failure.getCause()).isNull();
    }
    @Test void classify_wrappedConnectionFailure_keepsClassificationWithoutCause() {
        var failure=ProviderFailureClassifier.classify(new RuntimeException("secret",new UnknownHostException("private-host")));
        assertThat(failure.reason()).isEqualTo("connection_error");
        assertThat(failure.getMessage()).doesNotContain("secret","private-host");
    }
}
