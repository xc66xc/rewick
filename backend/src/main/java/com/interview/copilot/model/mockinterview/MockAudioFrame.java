package com.interview.copilot.model.mockinterview;

import java.util.UUID;

/** A session-scoped PCM packet; UUID bytes are network order, numeric header fields little endian. */
public record MockAudioFrame(int direction, int generation, UUID itemId, int sequence, byte[] pcm) {}
