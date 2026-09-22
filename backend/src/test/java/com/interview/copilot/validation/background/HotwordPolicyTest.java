package com.interview.copilot.validation.background;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.MissingNode;
import com.interview.copilot.exception.ApiException;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HotwordPolicyTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test void words_missingOrEmpty_returnsEmpty() {
        assertThat(HotwordPolicy.words(MissingNode.getInstance())).isEmpty();
        assertThat(HotwordPolicy.words(json.createArrayNode())).isEmpty();
    }
    @Test void words_duplicatesAndSpacing_normalizesTerms() {
        assertThat(HotwordPolicy.words(json.createArrayNode().add(" Agent ").add("Agent").add("虚拟量测")))
                .containsExactly("Agent", "虚拟量测");
    }
    @Test void words_invalidValues_rejects() {
        for (String word : new String[] {"", "a\nb", "x".repeat(81)}) {
            assertThatThrownBy(() -> HotwordPolicy.words(json.createArrayNode().add(word)))
                    .isInstanceOf(ApiException.class);
        }
        assertThatThrownBy(() -> HotwordPolicy.words(json.createArrayNode().add(3)))
                .isInstanceOf(ApiException.class);
    }
    @Test void words_countAndUtf8Budget_rejectsOversize() {
        var words = json.createArrayNode();
        for (int index = 0; index < 201; index++) words.add("term" + index);
        assertThatThrownBy(() -> HotwordPolicy.words(words)).isInstanceOf(ApiException.class);
        var large = json.createArrayNode();
        for (int index = 0; index < 30; index++) large.add("量".repeat(79) + index);
        assertThatThrownBy(() -> HotwordPolicy.words(large)).isInstanceOf(ApiException.class);
    }
}
