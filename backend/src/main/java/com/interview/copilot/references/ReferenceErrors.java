package com.interview.copilot.references;

import com.interview.copilot.common.ApiException;
import org.springframework.http.HttpStatus;

public final class ReferenceErrors {
    private ReferenceErrors() { }
    public static ApiException invalid(String message) { return new ApiException(HttpStatus.BAD_REQUEST, "invalid_reference", message); }
    public static ApiException missing() { return new ApiException(HttpStatus.NOT_FOUND, "reference_not_found", "资料不存在或无权访问。"); }
    public static ApiException limit() { return new ApiException(HttpStatus.CONFLICT, "reference_limit", "资料数量、大小或分段总量已超过平台限制。"); }
}
