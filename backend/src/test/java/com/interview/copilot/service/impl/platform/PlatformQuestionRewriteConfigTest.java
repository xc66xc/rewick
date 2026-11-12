package com.interview.copilot.service.impl.platform;

import com.interview.copilot.common.platform.PlatformConfigFixture;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.model.platform.PlatformConfig;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PlatformQuestionRewriteConfigTest {
    private final PlatformConfigFixture fixture = new PlatformConfigFixture();

    @AfterEach
    void close() { fixture.close(); }

    @Test
    void publish_legacyPayload_defaultsDisabledAndOldSavePreservesNewField() {
        fixture.service.publish(1, config(0, true, "careful", 1500));
        var oldClient = PlatformConfigFixture.config(1, null);
        var saved = fixture.service.publish(1, oldClient);
        assertThat(saved.questionRewrite()).isEqualTo(new PlatformConfig.QuestionRewrite(true, "careful", 1500));
        assertThat(fixture.service.snapshot().view().questionRewrite()).isEqualTo(saved.questionRewrite());
        assertThat(fixture.row.get().payload()).contains("questionRewrite").doesNotContain("synthetic-key");
    }

    @Test
    void publish_missingOrDisabledBoundModel_rejectsWithoutChangingCurrentConfig() {
        fixture.service.publish(1, config(0, true, "careful", 1500));
        var base = PlatformConfigFixture.config(1, null);
        var disabled = base.models().stream().map(model -> new PlatformConfig.Model(model.id(), model.name(),
                model.providerId(), model.model(), !model.id().equals("careful"), model.maxOutputTokens())).toList();
        var draft = new PlatformConfig(1, base.providers(), disabled, "fast", base.asr(), base.embedding(),
                base.webSearch(), "", null, new PlatformConfig.QuestionRewrite(true, "careful", 1500));
        assertThatThrownBy(() -> fixture.service.publish(1, draft)).isInstanceOf(ApiException.class);
        assertThat(fixture.service.get().version()).isEqualTo(1);
    }

    @Test
    void publish_timeoutOutOfRange_rejects() {
        assertThatThrownBy(() -> fixture.service.publish(1, config(0, true, "fast", 3001)))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void get_legacyConfiguration_defaultsDisabledWithoutDataMigration() {
        fixture.service.publish(1, PlatformConfigFixture.config(0, "synthetic-key"));
        assertThat(fixture.service.get().questionRewrite()).isEqualTo(PlatformConfig.QuestionRewrite.disabled());
    }

    private PlatformConfig config(long version, boolean enabled, String model, int timeout) {
        var base = PlatformConfigFixture.config(version, "synthetic-key");
        return new PlatformConfig(version, base.providers(), base.models(), base.defaultModelId(), base.asr(),
                base.embedding(), base.webSearch(), "", null, new PlatformConfig.QuestionRewrite(enabled, model, timeout));
    }
}
