package com.interview.copilot.common.references;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class ReferenceIndexFailureTest {
    @Test void message_unexpectedException_doesNotExposeRawContents() {
        assertThat(ReferenceIndexFailure.message("write",new IllegalStateException("private-document-and-key")))
                .contains("写入").doesNotContain("private-document","key");
    }
}
