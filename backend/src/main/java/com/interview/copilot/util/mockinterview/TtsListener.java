package com.interview.copilot.util.mockinterview;

import com.interview.copilot.util.ai.ProviderJson;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.function.Consumer;

/** Bounded vendor listener; WebSocket fragmentation must not split PCM16 samples downstream. */
public final class TtsListener implements WebSocket.Listener {
    public final CompletableFuture<Void> started = new CompletableFuture<>();
    public final CompletableFuture<Void> finished = new CompletableFuture<>();
    private final StringBuilder text = new StringBuilder();
    private final ProviderJson json;
    private final String taskId;
    private final Consumer<byte[]> audio;
    private long bytes;
    private int carry = -1;
    public TtsListener(ProviderJson json, String taskId, Consumer<byte[]> audio) { this.json=json;this.taskId=taskId;this.audio=audio; }
    public void onOpen(WebSocket socket) { socket.request(1); }
    public CompletionStage<?> onText(WebSocket socket, CharSequence data, boolean last) {
        try {
            if (text.length() + data.length() > 65536) throw new IllegalArgumentException("TTS frame too large");
            text.append(data);
            if (last) {
                var event=json.parse(text.toString());text.setLength(0);
                if (!taskId.equals(event.path("header").path("task_id").asText())) throw new IllegalArgumentException("TTS task mismatch");
                switch(event.path("header").path("event").asText()) {
                    case "task-started" -> started.complete(null);
                    case "task-finished" -> {if(carry>=0)throw new IllegalArgumentException("PCM alignment");finished.complete(null);}
                    case "task-failed" -> throw new IllegalStateException("TTS vendor failure");
                    default -> { }
                }
            }
            socket.request(1);
        } catch(RuntimeException error) { fail(error);socket.abort(); }
        return CompletableFuture.completedFuture(null);
    }
    public CompletionStage<?> onBinary(WebSocket socket, ByteBuffer data, boolean last) {
        try {
            bytes += data.remaining();
            if (!started.isDone() || bytes > 6L*1024*1024) throw new IllegalStateException("TTS audio limit");
            byte[] buffer=new byte[data.remaining()+(carry>=0?1:0)];int offset=0;
            if(carry>=0){buffer[offset++]=(byte)carry;carry=-1;}
            data.get(buffer,offset,data.remaining());
            int even=buffer.length-buffer.length%2;
            if(even<buffer.length)carry=Byte.toUnsignedInt(buffer[even]);
            for(int from=0;from<even;from+=32768)audio.accept(java.util.Arrays.copyOfRange(buffer,from,Math.min(even,from+32768)));
            socket.request(1);
        } catch(RuntimeException error) {fail(error);socket.abort();}
        return CompletableFuture.completedFuture(null);
    }
    public CompletionStage<?> onClose(WebSocket socket,int status,String reason) {
        if(!finished.isDone())fail(new IllegalStateException("TTS closed before completion"));
        return CompletableFuture.completedFuture(null);
    }
    public void onError(WebSocket socket,Throwable error){fail(error);}
    private void fail(Throwable error){started.completeExceptionally(error);finished.completeExceptionally(error);}
}
