package com.interview.copilot.util.asr;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.exception.ApiException;
import org.junit.jupiter.api.Test;

class AsrProtocolTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void run_explicitEmptyVocabulary_disablesHotwordsWithoutSendingEmptyParameter() throws Exception {
        var input = json.readTree("{\"payload\":{\"parameters\":{\"format\":\"pcm\",\"sample_rate\":16000,\"vocabulary\":{}},\"input\":{}}}");
        var output = json.valueToTree(AsrProtocol.run(input, "upstream", AsrEndpoint.QWEN_STREAMING));
        assertThat(output.at("/payload/parameters/vocabulary").isMissingNode()).isTrue();
    }

    @Test
    void run_sessionVocabulary_preservesWeightsAndServerModel() throws Exception {
        var input = json.readTree("""
                {"payload":{"parameters":{"format":"pcm","sample_rate":16000,
                "vocabulary":{"虚拟量测":3,"Agent":4}},"input":{}}}
                """);
        var output = json.valueToTree(AsrProtocol.run(input, "upstream", AsrEndpoint.QWEN_STREAMING));
        assertThat(output.at("/payload/parameters/vocabulary")).isEqualTo(input.at("/payload/parameters/vocabulary"));
        assertThat(output.at("/payload/model").asText()).isEqualTo(AsrEndpoint.QWEN_STREAMING);
        assertThat(output.at("/payload/parameters/heartbeat").asBoolean()).isTrue();
    }

    @Test
    void run_invalidOrUnsupportedVocabulary_rejectsInsteadOfSilentlyIgnoring() throws Exception {
        for (String vocabulary : new String[] {"null", "[]", "{\"Agent\":50}", "{\"Agent\":1.5}", "{\" \":3}", "{\"Agent\":0}"}) {
            var input = json.readTree("{\"payload\":{\"parameters\":{\"format\":\"pcm\",\"sample_rate\":16000,\"vocabulary\":" + vocabulary + "},\"input\":{}}}");
            assertThatThrownBy(() -> AsrProtocol.run(input, "id", AsrEndpoint.QWEN_STREAMING)).isInstanceOf(ApiException.class);
        }
        var valid = json.readTree("""
                {"payload":{"parameters":{"format":"pcm","sample_rate":16000,"vocabulary":{"Agent":3}},"input":{}}}
                """);
        assertThatThrownBy(() -> AsrProtocol.run(valid, "id", "paraformer-realtime-v2")).isInstanceOf(ApiException.class);
    }

    @Test
    void resolve_streamingModel_requiresInferenceEndpoint() {
        assertThat(AsrEndpoint.resolve("wss://example.com/api-ws/v1/inference", AsrEndpoint.QWEN_STREAMING).getQuery()).isNull();
        for (String suffix : new String[] {"/realtime", "/inference?model=x", "/inference#x"}) {
            assertThatThrownBy(() -> AsrEndpoint.resolve("wss://example.com/api-ws/v1" + suffix, AsrEndpoint.QWEN_STREAMING))
                    .isInstanceOf(ApiException.class);
        }
    }

    @Test
    void event_partialAndFinal_preservesDesktopSentenceProtocol() throws Exception {
        for (boolean ended : new boolean[] {false, true}) {
            var input = json.readTree("{\"header\":{\"event\":\"result-generated\"},\"payload\":{\"output\":{\"sentence\":{\"text\":\"虚拟量测 Agent\",\"begin_time\":0,\"end_time\":1200,\"sentence_end\":" + ended + "}}}}");
            var output = json.valueToTree(AsrProtocol.event(input, "desktop"));
            assertThat(output.at("/header/task_id").asText()).isEqualTo("desktop");
            assertThat(output.at("/payload/output/sentence/sentence_end").asBoolean()).isEqualTo(ended);
            assertThat(output.at("/payload/output/sentence/text").asText()).isEqualTo("虚拟量测 Agent");
        }
    }
}
