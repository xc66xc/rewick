package com.interview.copilot.ai;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.codec.ServerSentEvent;

/** One response owns this decoder; raw bytes and each SSE event are bounded before decoding. */
final class ProviderSseDecoder {
    private static final int MAX_EVENT_BYTES = 65536;
    private static final int MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
    private final ByteArrayOutputStream line = new ByteArrayOutputStream();
    private final List<String> data = new ArrayList<>();
    private int eventBytes;
    private int responseBytes;

    List<ServerSentEvent<String>> accept(DataBuffer input) {
        responseBytes += input.readableByteCount();
        if (responseBytes > MAX_RESPONSE_BYTES) { throw ProviderErrors.failed(); }
        List<ServerSentEvent<String>> result = new ArrayList<>();
        while (input.readableByteCount() > 0) {
            if (++eventBytes > MAX_EVENT_BYTES) { throw ProviderErrors.failed(); }
            byte value = input.read();
            if (value == '\n') { consumeLine(result); }
            else { line.write(value); }
        }
        return result;
    }

    List<ServerSentEvent<String>> finish() {
        List<ServerSentEvent<String>> result = new ArrayList<>();
        if (line.size() > 0) { consumeLine(result); }
        if (!data.isEmpty()) { dispatch(result); }
        return result;
    }

    private void consumeLine(List<ServerSentEvent<String>> result) {
        String text = decode(line.toByteArray());
        line.reset();
        if (text.endsWith("\r")) { text = text.substring(0, text.length() - 1); }
        if (text.isEmpty()) { dispatch(result); return; }
        if (text.startsWith("data:")) {
            String value = text.substring(5);
            data.add(value.startsWith(" ") ? value.substring(1) : value);
        }
    }

    private void dispatch(List<ServerSentEvent<String>> result) {
        if (data.isEmpty()) { result.add(ServerSentEvent.<String>builder().comment("activity").build()); }
        else { result.add(ServerSentEvent.<String>builder(String.join("\n", data)).build()); }
        data.clear();
        eventBytes = 0;
    }

    private String decode(byte[] bytes) {
        try {
            return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException exception) { throw ProviderErrors.failed(); }
    }
}
