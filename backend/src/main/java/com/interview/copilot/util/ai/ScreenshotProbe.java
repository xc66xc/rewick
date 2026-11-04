package com.interview.copilot.util.ai;

import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.validation.ai.LlmThinkingPolicy;
import com.interview.copilot.exception.ai.ProviderErrors;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Synthetic image verifies real vision support, without reading any user's screen. */
public final class ScreenshotProbe {
    private ScreenshotProbe() {}
    public static Map<String, Object> body(ProviderProperties.Llm endpoint) {
        Map<String, Object> body = new HashMap<>();
        body.put("model", endpoint.getModel());
        body.put("stream", false);
        body.put("temperature", 0);
        body.put("max_tokens", Math.min(128, endpoint.getMaxOutputTokens()));
        body.put("messages", List.of(Map.of("role", "user", "content", List.of(
                Map.of("type", "text", "text", "Read the two-digit number in this image. Reply with only the number."),
                Map.of("type", "image_url", "image_url", Map.of("url", image()))))));
        if (!"none".equals(endpoint.getThinkingProtocol())) LlmThinkingPolicy.apply(body, endpoint, "disabled");
        return body;
    }

    private static String image() {
        var image = new BufferedImage(240, 120, BufferedImage.TYPE_INT_RGB);
        var graphics = image.createGraphics();
        try {
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, 240, 120);
            graphics.setColor(Color.BLACK);
            // Draw block digits without depending on fonts installed in the server image.
            graphics.fillRect(48, 20, 9, 39);
            graphics.fillRect(48, 55, 59, 9);
            graphics.fillRect(98, 20, 9, 79);
            graphics.fillRect(134, 20, 59, 9);
            graphics.fillRect(184, 20, 9, 39);
            graphics.fillRect(134, 55, 59, 9);
            graphics.fillRect(134, 59, 9, 40);
            graphics.fillRect(134, 90, 59, 9);
        } finally { graphics.dispose(); }
        try (var bytes = new ByteArrayOutputStream()) {
            if (!ImageIO.write(image, "jpeg", bytes)) throw ProviderErrors.failed();
            return "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(bytes.toByteArray());
        } catch (IOException error) { throw ProviderErrors.failed(); }
        finally { image.flush(); }
    }
}
