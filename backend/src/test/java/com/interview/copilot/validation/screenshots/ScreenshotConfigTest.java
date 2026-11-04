package com.interview.copilot.validation.screenshots;

import com.interview.copilot.common.platform.PlatformConfigFixture;
import com.interview.copilot.model.platform.PlatformConfig;
import com.interview.copilot.exception.ApiException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ScreenshotConfigTest {
    @Test
    void publish_separateVisionBinding_survivesEncryptedConfigRoundTrip() {
        try (var fixture = new PlatformConfigFixture()) {
            var base = PlatformConfigFixture.config(0, "synthetic-key");
            fixture.service.publish(1, new PlatformConfig(0, base.providers(), base.models(), base.defaultModelId(),
                    base.asr(), base.embedding(), PlatformConfig.WebSearch.disabled(), "careful"));
            var current = fixture.service.snapshot();
            assertEquals("careful", current.view().screenshotModelId());
            assertEquals("upstream-fast", current.llm(null).config().getModel());
            assertEquals("upstream-careful", current.llm(current.view().screenshotModelId()).config().getModel());
            assertFalse(fixture.row.get().payload().contains("synthetic-key"));
        }
    }

    @Test
    void publish_missingScreenshotBinding_rejectsWithoutChangingPublishedConfig() {
        try (var fixture = new PlatformConfigFixture()) {
            var base = PlatformConfigFixture.config(0, "synthetic-key");
            assertThrows(ApiException.class, () -> fixture.service.publish(1,
                    new PlatformConfig(0, base.providers(), base.models(), base.defaultModelId(),
                            base.asr(), base.embedding(), PlatformConfig.WebSearch.disabled(), "missing")));
            assertFalse(fixture.row.get().published());
        }
    }
}
