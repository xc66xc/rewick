package com.interview.copilot.util.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.interview.copilot.exception.ApiException;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.buffer.DefaultDataBufferFactory;
import org.springframework.http.codec.ServerSentEvent;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

public class ProviderSseDecoderTest {
    @Test
    void accept_unicodeSplitAcrossNetworkChunks_preservesTextAndEvents() {
        ProviderSseDecoder decoder = new ProviderSseDecoder();
        List<ServerSentEvent<String>> events = new ArrayList<>();
        byte[] bytes = "data: 中文\r\n\r\ndata: [DONE]\n\n".getBytes(StandardCharsets.UTF_8);

        for (byte value : bytes) {
            events.addAll(
                    decoder.accept(
                            DefaultDataBufferFactory.sharedInstance.wrap(new byte[] {value})));
        }

        assertThat(events).extracting(ServerSentEvent::data).containsExactly("中文", "[DONE]");
    }

    @Test
    void accept_unterminatedOversizedLine_rejectsBeforeUnboundedBuffering() {
        ProviderSseDecoder decoder = new ProviderSseDecoder();
        byte[] bytes = ("data: " + "x".repeat(65536)).getBytes(StandardCharsets.UTF_8);
        assertThatThrownBy(
                        () -> decoder.accept(DefaultDataBufferFactory.sharedInstance.wrap(bytes)))
                .isInstanceOf(ApiException.class);
    }
}
