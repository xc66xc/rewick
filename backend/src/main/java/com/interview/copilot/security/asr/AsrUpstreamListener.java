package com.interview.copilot.security.asr;

import java.net.http.WebSocket;
import java.util.concurrent.CompletionStage;

public final class AsrUpstreamListener implements WebSocket.Listener {
    private final AsrBridge bridge;
    private final String runPayload;
    private final StringBuilder fragments = new StringBuilder();

    AsrUpstreamListener(AsrBridge bridge, String runPayload) {
        this.bridge = bridge;
        this.runPayload = runPayload;
    }

    @Override
    public void onOpen(WebSocket socket) {
        bridge.opened(socket, runPayload);
        socket.request(1);
    }

    @Override
    public CompletionStage<?> onText(WebSocket socket, CharSequence data, boolean last) {
        if (fragments.length() + data.length() > 65536) {
            bridge.fail();
            return null;
        }
        fragments.append(data);
        if (last) {
            bridge.received(fragments.toString());
            fragments.setLength(0);
        }
        socket.request(1);
        return null;
    }

    @Override
    public CompletionStage<?> onClose(WebSocket socket, int statusCode, String reason) {
        bridge.fail();
        return null;
    }

    @Override
    public void onError(WebSocket socket, Throwable error) {
        bridge.fail();
    }
}
