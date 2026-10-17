package com.interview.copilot.util.mockinterview;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.util.ai.ProviderJson;
import java.io.ByteArrayOutputStream;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class TtsListenerTest {
    private final WebSocket socket=mock(WebSocket.class);
    private final ByteArrayOutputStream audio=new ByteArrayOutputStream();
    private final TtsListener listener=new TtsListener(new ProviderJson(new ObjectMapper()),"task",audio::writeBytes);
    @Test void fragmentedControlAndOddBinaryFragmentsPreservePcmSamples() {
        listener.onText(socket,"{\"header\":",false);
        listener.onText(socket,"{\"task_id\":\"task\",\"event\":\"task-started\"}}",true);
        listener.onBinary(socket,ByteBuffer.wrap(new byte[]{1,2,3}),false);
        listener.onBinary(socket,ByteBuffer.wrap(new byte[]{4,5,6}),true);
        event("task-finished");
        assertThat(audio.toByteArray()).containsExactly(1,2,3,4,5,6);
        assertThat(listener.started).isCompleted();
        assertThat(listener.finished).isCompleted();
        verify(socket,never()).abort();
    }
    @Test void earlyCloseDoesNotPretendSpeechCompleted() {
        event("task-started");listener.onClose(socket,1000,"done");
        assertThat(listener.finished).isCompletedExceptionally();
    }
    @Test void oddFinalSampleFailsInsteadOfProducingCorruptAudio() {
        event("task-started");listener.onBinary(socket,ByteBuffer.wrap(new byte[]{1}),true);event("task-finished");
        assertThat(listener.finished).isCompletedExceptionally();verify(socket).abort();
    }
    @Test void mismatchedTaskAndOversizedControlAreRejected() {
        listener.onText(socket,"{\"header\":{\"task_id\":\"other\",\"event\":\"task-started\"}}",true);
        assertThat(listener.started).isCompletedExceptionally();verify(socket).abort();
    }
    private void event(String kind) {listener.onText(socket,"{\"header\":{\"task_id\":\"task\",\"event\":\""+kind+"\"}}",true);}
}
