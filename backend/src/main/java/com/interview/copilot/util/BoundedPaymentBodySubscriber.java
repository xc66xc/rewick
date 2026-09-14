package com.interview.copilot.util;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 限制支付查询响应体大小，超限立即取消接收。
 */
public final class BoundedPaymentBodySubscriber implements HttpResponse.BodySubscriber<byte[]> {
    private static final int MAX_BYTES = 65536;
    private final ByteArrayOutputStream output = new ByteArrayOutputStream();
    private final CompletableFuture<byte[]> result = new CompletableFuture<>();
    private Flow.Subscription subscription;

    public CompletionStage<byte[]> getBody() { return result; }

    public void onSubscribe(Flow.Subscription value) {
        subscription = value;
        subscription.request(1);
    }

    public void onNext(List<ByteBuffer> buffers) {
        for (ByteBuffer buffer : buffers) {
            if (buffer.remaining() > MAX_BYTES - output.size()) {
                subscription.cancel();
                result.completeExceptionally(new IOException("Payment response exceeds size limit"));
                return;
            }
            byte[] bytes = new byte[buffer.remaining()];
            buffer.get(bytes);
            output.writeBytes(bytes);
        }
        subscription.request(1);
    }

    public void onError(Throwable error) { result.completeExceptionally(error); }

    public void onComplete() { result.complete(output.toByteArray()); }
}
