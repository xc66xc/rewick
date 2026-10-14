package com.interview.copilot.exception.ai;

import com.interview.copilot.exception.ApiException;
import org.springframework.http.HttpStatus;

/** Diagnostics contain only fixed classifications and numeric HTTP status, never response bodies. */
public final class ProviderFailure extends ApiException {
    private final String reason;
    private final int upstreamStatus;

    public ProviderFailure(String reason, String message) {
        this(reason, 0, message);
    }

    private ProviderFailure(String reason, int upstreamStatus, String message) {
        super(HttpStatus.BAD_GATEWAY, "PROVIDER_UNAVAILABLE", message);
        this.reason = reason;
        this.upstreamStatus = upstreamStatus;
    }

    public String reason() { return reason; }
    public int upstreamStatus() { return upstreamStatus; }

    public static ProviderFailure http(int status) {
        String hint = switch (status) {
            case 401 -> "认证失败，请检查该地域的 API Key。";
            case 403 -> "访问被拒绝，请检查模型权限和业务空间授权。";
            case 404 -> "接口或模型未找到，请检查接口地址及模型名称。";
            case 429 -> "请求被限流或额度不足，请检查供应商额度与限流设置。";
            case 400, 422 -> "请求参数被拒绝，请检查模型、地域和输入参数。";
            default -> "请求未成功，请检查供应商服务状态。";
        };
        return new ProviderFailure("http_error", status, "供应商返回 HTTP " + status + "：" + hint);
    }
}
