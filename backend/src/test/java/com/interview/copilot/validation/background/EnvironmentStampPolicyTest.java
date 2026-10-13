package com.interview.copilot.validation.background;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EnvironmentStampPolicyTest {
    private final ObjectMapper json = new ObjectMapper();

    private ObjectNode stamp(String text, String color) {
        return json.createObjectNode().put("text", text).put("color", color);
    }

    private ObjectNode request() {
        ObjectNode body = json.createObjectNode().put("version", 1).put("mutationId", UUID.randomUUID().toString());
        body.set("stamp", stamp("已准备", "blue"));
        return body;
    }

    @ParameterizedTest
    @ValueSource(strings = {"blue", "amber", "green", "red"})
    void stamp_supportedColors_retainsExplicitSelection(String color) {
        assertThat(EnvironmentStampPolicy.stamp(stamp("  待 跟进  ", color)))
                .isEqualTo(stamp("待 跟进", color));
    }

    @ParameterizedTest
    @ValueSource(strings = {"面试准备已完成啦", "A B", "😀😀😀😀😀😀😀😀", "x"})
    void stamp_unicodeAndSpaces_acceptsUpToEightCodePoints(String text) {
        assertThat(EnvironmentStampPolicy.stamp(stamp(text, "green")).path("text").asText()).isEqualTo(text);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   ", "123456789", "😀😀😀😀😀😀😀😀😀", "a\nb", "a\rb", "a\tb", "a\u0000b", "a\u2028b", "a\u2029b", "\uD800"})
    void stamp_invalidText_rejectsInput(String text) {
        assertThatThrownBy(() -> EnvironmentStampPolicy.stamp(stamp(text, "blue"))).isInstanceOf(ApiException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"BLUE", "purple", "", "#123456"})
    void stamp_unknownColor_rejectsInput(String color) {
        assertThatThrownBy(() -> EnvironmentStampPolicy.stamp(stamp("准备中", color))).isInstanceOf(ApiException.class);
    }

    @Test
    void stamp_extraOrMissingFields_rejectsInput() {
        var value = stamp("准备中", "blue").put("style", "color:red");
        assertThatThrownBy(() -> EnvironmentStampPolicy.stamp(value)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> EnvironmentStampPolicy.stamp(json.createObjectNode().put("text", "准备中")))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> EnvironmentStampPolicy.stamp(json.createObjectNode().put("color", "blue")))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void request_explicitNull_acceptsClearButMissingStampRejects() {
        var value = request().putNull("stamp");
        assertThat(EnvironmentStampPolicy.request(value).stamp().isNull()).isTrue();
        value.remove("stamp");
        assertThatThrownBy(() -> EnvironmentStampPolicy.request(value)).isInstanceOf(ApiException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-1", "0.5", "9223372036854775808", "null", "\"1\""})
    void request_invalidVersion_rejectsInput(String version) throws Exception {
        var value = request();
        value.set("version", json.readTree(version));
        assertThatThrownBy(() -> EnvironmentStampPolicy.request(value)).isInstanceOf(ApiException.class);
    }

    @Test
    void request_unknownFieldOrInvalidMutation_rejectsInput() {
        assertThatThrownBy(() -> EnvironmentStampPolicy.request(request().put("userId", 8))).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> EnvironmentStampPolicy.request(request().put("mutationId", "1-1-1-1-1")))
                .isInstanceOf(ApiException.class);
        assertThatCode(() -> EnvironmentStampPolicy.request(request())).doesNotThrowAnyException();
    }
}
