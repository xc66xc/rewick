package com.interview.copilot.validation.screenshots;

import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.util.ai.ScreenshotProbe;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ScreenshotPolicyTest {
    @Test
    void image_realJpegHeader_acceptsWithoutDecodingPixels() {
        var endpoint = new ProviderProperties.Llm();
        var body = ScreenshotProbe.body(endpoint);
        var messages = (java.util.List<?>) body.get("messages");
        var message = (java.util.Map<?, ?>) messages.get(0);
        var content = (java.util.List<?>) message.get("content");
        var part = (java.util.Map<?, ?>) content.get(1);
        String image = (String) ((java.util.Map<?, ?>) part.get("image_url")).get("url");
        assertDoesNotThrow(() -> ScreenshotPolicy.image(image));
    }

    @Test
    void image_urlsMalformedAndOversizePayload_rejects() {
        for (String image : new String[]{"https://example.invalid/image.jpg", "data:image/png;base64,AAAA",
                ScreenshotPolicy.PREFIX + "@@@@", ScreenshotPolicy.PREFIX + "A".repeat(8 * 1024 * 1024 + 1)}) {
            assertThrows(ApiException.class, () -> ScreenshotPolicy.image(image));
        }
        assertThrows(ApiException.class, () -> ScreenshotPolicy.image(null));
    }

    @Test
    void question_unclearOrEmpty_neverBecomesInventedQuestion() {
        assertEquals("题目正文", ScreenshotPolicy.question(" 题目正文 "));
        assertThrows(ApiException.class, () -> ScreenshotPolicy.question("缺少条件[无法辨认]"));
        assertThrows(ApiException.class, () -> ScreenshotPolicy.question(" "));
    }

    @Test
    void body_extraction_disablesThinkingAndKeepsImageSeparate() {
        var endpoint = new ProviderProperties.Llm();
        endpoint.setModel("vision");
        endpoint.setThinkingProtocol("bailian");
        endpoint.setThinkingMode("enabled");
        var body = ScreenshotPolicy.body(endpoint, "synthetic-image");
        assertEquals(false, body.get("enable_thinking"));
        assertEquals("vision", body.get("model"));
        assertEquals(false, body.get("stream"));
    }
}
