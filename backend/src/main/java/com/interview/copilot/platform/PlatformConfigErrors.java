package com.interview.copilot.platform;

import com.interview.copilot.common.ApiException;
import org.springframework.http.HttpStatus;

final class PlatformConfigErrors {
    private PlatformConfigErrors() { }
    static ApiException invalid(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PLATFORM_CONFIG", message);
    }
    static ApiException conflict() {
        return new ApiException(HttpStatus.CONFLICT, "CONFIG_VERSION_CONFLICT", "平台配置已更新，请重新加载后再保存。");
    }
    static ApiException secretUnavailable() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "PLATFORM_SECRET_UNAVAILABLE", "平台密钥存储暂不可用，请检查服务端主密钥配置。");
    }
    static ApiException storageUnavailable() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "PLATFORM_CONFIG_UNAVAILABLE", "平台配置暂不可用，请联系管理员。");
    }
}
