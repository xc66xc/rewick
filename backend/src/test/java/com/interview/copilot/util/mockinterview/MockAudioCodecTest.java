package com.interview.copilot.util.mockinterview;

import com.interview.copilot.exception.ApiException;
import java.nio.ByteBuffer;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class MockAudioCodecTest {
    @Test void binaryRoundtripPreservesNetworkUuidAndLittleEndianCounters() {
        UUID id=UUID.fromString("01234567-89ab-cdef-0123-456789abcdef");
        byte[] encoded=MockAudioCodec.encode(258,id,513,new byte[]{1,2,3,4});
        assertThat(encoded[4]).isEqualTo((byte)2);
        assertThat(encoded[5]).isEqualTo((byte)1);
        assertThat(encoded[8]).isEqualTo((byte)1);
        var frame=MockAudioCodec.decode(ByteBuffer.wrap(encoded),1);
        assertThat(frame.itemId()).isEqualTo(id);
        assertThat(frame.generation()).isEqualTo(258);
        assertThat(frame.sequence()).isEqualTo(513);
        assertThat(frame.pcm()).containsExactly(1,2,3,4);
    }
    @Test void invalidFramesFailBeforeAudioAllocation() {
        byte[] valid=MockAudioCodec.encode(0,UUID.randomUUID(),0,new byte[2]);
        assertThatThrownBy(()->MockAudioCodec.decode(ByteBuffer.wrap(valid),0)).isInstanceOf(ApiException.class);
        valid[0]=0;
        assertThatThrownBy(()->MockAudioCodec.decode(ByteBuffer.wrap(valid),1)).isInstanceOf(ApiException.class);
        assertThatThrownBy(()->MockAudioCodec.decode(ByteBuffer.allocate(29),0)).isInstanceOf(ApiException.class);
        assertThatThrownBy(()->MockAudioCodec.decode(ByteBuffer.allocate(65565),0)).isInstanceOf(ApiException.class);
        assertThatThrownBy(()->MockAudioCodec.encode(0,UUID.randomUUID(),0,new byte[3])).isInstanceOf(ApiException.class);
    }
}
