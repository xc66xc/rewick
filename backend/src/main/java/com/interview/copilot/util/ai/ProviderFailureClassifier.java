package com.interview.copilot.util.ai;

import com.interview.copilot.exception.ai.ProviderFailure;
import org.springframework.core.io.buffer.DataBufferLimitException;
import org.springframework.core.codec.DecodingException;
import java.net.ConnectException;
import java.net.UnknownHostException;
import javax.net.ssl.SSLException;
import java.util.concurrent.TimeoutException;

/** Classifies throwable types without retaining their possibly sensitive messages or causes. */
public final class ProviderFailureClassifier {
    private ProviderFailureClassifier() {}

    public static ProviderFailure classify(Throwable error) {
        if (error instanceof ProviderFailure failure) return failure;
        Throwable current = error;
        for (int depth = 0; current != null && depth < 10; depth++, current = current.getCause()) {
            ProviderFailure failure = known(current);
            if (failure != null) return failure;
        }
        return new ProviderFailure("transport_error", "供应商请求失败，请检查网络与服务状态。");
    }

    private static ProviderFailure known(Throwable error) {
        if (error instanceof TimeoutException || error instanceof io.netty.handler.timeout.ReadTimeoutException)
            return new ProviderFailure("timeout", "供应商请求超时，请稍后重试。");
        if (error instanceof DataBufferLimitException)
            return new ProviderFailure("response_too_large", "供应商响应超过大小限制，请检查返回维度或批次大小。");
        if (error instanceof DecodingException)
            return new ProviderFailure("invalid_json", "供应商响应不是有效的 JSON 数据。");
        return transport(error);
    }

    private static ProviderFailure transport(Throwable error) {
        if (error instanceof SSLException)
            return new ProviderFailure("tls_error", "供应商连接的 TLS 校验失败，请检查证书与接口地址。");
        if (error instanceof UnknownHostException || error instanceof ConnectException)
            return new ProviderFailure("connection_error", "无法连接供应商，请检查域名与网络。");
        return null;
    }
}
