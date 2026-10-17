package com.interview.copilot.util.mockinterview;

import com.interview.copilot.exception.ApiException;
import com.interview.copilot.model.mockinterview.MockAudioFrame;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.http.HttpStatus;

public final class MockAudioCodec {
    public static final int HEADER_BYTES = 28;
    public static final int MAX_PCM_BYTES = 65536;
    private MockAudioCodec() {}

    public static MockAudioFrame decode(ByteBuffer source, int direction) {
        ByteBuffer input = source.slice().order(ByteOrder.LITTLE_ENDIAN);
        if (input.remaining() <= HEADER_BYTES || input.remaining() > HEADER_BYTES + MAX_PCM_BYTES)
            throw invalid();
        if (input.get() != 'M' || input.get() != 'I' || input.get() != 1 || input.get() != direction)
            throw invalid();
        int generation = input.getInt();
        byte[] id = new byte[16];
        input.get(id);
        ByteBuffer uuid = ByteBuffer.wrap(id);
        UUID itemId = new UUID(uuid.getLong(), uuid.getLong());
        int sequence = input.getInt();
        if (generation < 0 || sequence < 0 || input.remaining() % 2 != 0) throw invalid();
        byte[] pcm = new byte[input.remaining()];
        input.get(pcm);
        return new MockAudioFrame(direction, generation, itemId, sequence, pcm);
    }

    public static byte[] encode(int generation, UUID speechId, int sequence, byte[] pcm) {
        if (generation < 0 || sequence < 0 || pcm.length == 0 || pcm.length > MAX_PCM_BYTES || pcm.length % 2 != 0)
            throw invalid();
        return ByteBuffer.allocate(HEADER_BYTES + pcm.length).order(ByteOrder.LITTLE_ENDIAN)
                .put((byte) 'M').put((byte) 'I').put((byte) 1).put((byte) 1).putInt(generation)
                .put(HexFormat.of().parseHex(speechId.toString().replace("-", "")))
                .putInt(sequence).put(pcm).array();
    }

    private static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "MOCK_INVALID_AUDIO", "音频数据格式不正确，请重新连接。");
    }
}
