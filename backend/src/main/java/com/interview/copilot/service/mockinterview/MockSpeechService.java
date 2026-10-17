package com.interview.copilot.service.mockinterview;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

public interface MockSpeechService {
    void stream(JsonNode runtime, String text, String voiceId, Consumer<byte[]> audio, BooleanSupplier cancelled);
}
