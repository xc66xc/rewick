package com.interview.copilot.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import com.interview.copilot.common.ApiException;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class PlatformEmbeddingTest {
    private final PlatformConfigFixture fixture = new PlatformConfigFixture();
    @AfterEach void close() { fixture.close(); }

    @Test void publish_enabledEmbedding_exposesSafeCatalogAndRestoresEncryptedKey() throws Exception {
        fixture.service.publish(1, config(0, true, "https://example.invalid/embeddings", "secret"));
        var snapshot = fixture.service.snapshot();
        assertThat(snapshot.availableEmbeddingServices()).hasSize(1);
        assertThat(snapshot.embedding("vector").getApiKey()).isEqualTo("secret");
        assertThat(fixture.json.writeValueAsString(snapshot.availableEmbeddingServices()))
                .contains("\"dimensions\":1024", "\"model\":\"bge\"").doesNotContain("secret", "example.invalid");
        assertThat(fixture.row.get().payload()).doesNotContain("secret");
    }

    @Test void publish_disabledEmbedding_hidesCatalogAndRejectsExplicitSelection() {
        fixture.service.publish(1, config(0, false, "https://example.invalid/embeddings", "secret"));
        assertThat(fixture.service.snapshot().availableEmbeddingServices()).isEmpty();
        assertThatThrownBy(() -> fixture.service.snapshot().embedding("vector")).isInstanceOf(ApiException.class);
    }

    @Test void publish_changedEndpoint_changesIndexFingerprint() {
        fixture.service.publish(1, config(0, true, "https://first.invalid/embeddings", "secret"));
        String before = fixture.service.snapshot().availableEmbeddingServices().getFirst().fingerprint();
        fixture.service.publish(1, config(1, true, "https://second.invalid/embeddings", "secret"));
        assertThat(fixture.service.snapshot().availableEmbeddingServices().getFirst().fingerprint()).isNotEqualTo(before);
    }

    @Test void publish_loopbackWithoutKey_isAvailableButRemoteWithoutKeyRejected() {
        fixture.service.publish(1, config(0, true, "http://127.0.0.1:9999/embeddings", null));
        assertThat(fixture.service.snapshot().availableEmbeddingServices()).hasSize(1);
        assertThatThrownBy(() -> fixture.service.publish(1, config(1, true, "https://remote.invalid/embeddings", null)))
                .isInstanceOf(ApiException.class);
    }

    private PlatformConfig config(long version, boolean enabled, String url, String key) {
        return new PlatformConfig(version, List.of(new PlatformConfig.Provider("vector", "向量服务", "embedding", url,
                enabled, false, key)), List.of(), "", new PlatformConfig.Asr(false, "", ""),
                new PlatformConfig.Knowledge(false, "", ""), new PlatformConfig.Embedding(enabled, "vector", "bge", 1024));
    }
}
