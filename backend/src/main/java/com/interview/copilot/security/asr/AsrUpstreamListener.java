package com.interview.copilot.security.asr;

import java.net.http.WebSocket;
import java.util.concurrent.CompletionStage;

/**
 * @author Carl Wang
 * @date 2026-09-20
 * @description 监听上游转写连接并记录脱敏断开原因。
 */
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
            bridge.fail("upstream_frame_too_large");
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
        bridge.transportClosed("upstream", statusCode);
        return null;
    }

    @Override
    public void onError(WebSocket socket, Throwable error) {
        bridge.failure("upstream_transport_error", error);
    }
}
