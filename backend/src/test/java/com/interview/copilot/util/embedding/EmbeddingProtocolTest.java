package com.interview.copilot.util.embedding;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.exception.ApiException;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.List;
import java.util.Map;

public class EmbeddingProtocolTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void response_metadataRemovedAndIndexesPreserved() {
        var response =
                json.valueToTree(
                        Map.of(
                                "secret",
                                "hidden",
                                "data",
                                List.of(
                                        Map.of(
                                                "index",
                                                1,
                                                "embedding",
                                                List.of(1, 2),
                                                "metadata",
                                                "hidden"),
                                        Map.of("index", 0, "embedding", List.of(3, 4)))));
        var result = EmbeddingProtocol.response(response, 2, 2);
        assertThat(json.valueToTree(result).toString())
                .doesNotContain("hidden", "secret", "metadata");
        assertThat(json.valueToTree(result).path("data").get(0).path("index").asInt()).isEqualTo(1);
    }

    @Test
    void response_floatOverflowAndZeroNorm_rejects() {
        for (var vector :
                List.of(List.of(0.0, 0.0), List.of(1e100, 1.0), List.of(1e-100, 1e-100))) {
            var response =
                    json.valueToTree(
                            Map.of("data", List.of(Map.of("index", 0, "embedding", vector))));
            assertThatThrownBy(() -> EmbeddingProtocol.response(response, 1, 2))
                    .isInstanceOf(ApiException.class);
        }
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "{\"index\":0,\"embedding\":[1]}",
                "{\"index\":2,\"embedding\":[1,2]}",
                "{\"index\":0,\"embedding\":[1,\"2\"]}"
            })
    void response_invalidVector_rejects(String row) throws Exception {
        var response = json.readTree("{\"data\":[" + row + "]}");
        assertThatThrownBy(() -> EmbeddingProtocol.response(response, 1, 2))
                .isInstanceOf(ApiException.class);
    }
    @Test
    void response_dimensionMismatch_reportsExpectedAndActualWithoutVectorValues() {
        var response=json.valueToTree(Map.of("data",List.of(Map.of("index",0,"embedding",List.of(1,2)))));
        assertThatThrownBy(() -> EmbeddingProtocol.response(response,1,1024))
                .isInstanceOfSatisfying(com.interview.copilot.exception.ai.ProviderFailure.class, failure -> {
                    assertThat(failure.reason()).isEqualTo("embedding_dimensions");
                    assertThat(failure.getMessage()).contains("要求 1024 维","实际 2 维");
                });
    }

}
