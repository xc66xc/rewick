package com.interview.copilot.util.asr;

import com.interview.copilot.exception.ApiException;
import com.interview.copilot.model.asr.LiveTranslateSession;
import org.springframework.http.HttpStatus;
import java.net.URI;

/** Resolves model-specific WebSocket protocols for validation, probes and live sessions. */
public final class AsrEndpoint {
    public static final String QWEN_STREAMING = "qwen-audio-3.1-asr-flash-streaming";

    private AsrEndpoint() {}

    public static URI resolve(String url, String model) {
        URI endpoint = LiveTranslateSession.endpoint(url, model);
        if (QWEN_STREAMING.equals(model)
                && (!"/api-ws/v1/inference".equals(endpoint.getPath())
                        || endpoint.getRawQuery() != null || endpoint.getFragment() != null)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "ASR_INFERENCE_ENDPOINT_REQUIRED",
                    "该模型需要 /api-ws/v1/inference 接口地址，不能使用 /realtime 或附带查询参数。");
        }
        return endpoint;
    }
}
