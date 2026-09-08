package com.interview.copilot.ai;

import com.interview.copilot.common.ApiException;
import org.springframework.http.HttpStatus;

public final class ProviderErrors {
    private ProviderErrors() { }

    public static ApiException unavailable() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "CAPABILITY_UNAVAILABLE", "平台暂未启用此能力");
    }

    public static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_AI_REQUEST", "请求格式或参数超出平台限制");
    }

    public static ApiException failed() {
        return new ApiException(HttpStatus.BAD_GATEWAY, "PROVIDER_UNAVAILABLE", "服务暂时不可用，请稍后重试");
    }

    public static ApiException busy() {
        return new ApiException(HttpStatus.TOO_MANY_REQUESTS, "CONCURRENCY_LIMIT", "当前请求过多，请稍后重试");
    }
}
