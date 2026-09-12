package com.interview.copilot.validation.wallet;

import com.interview.copilot.exception.ApiException;

import org.springframework.http.HttpStatus;

public final class WalletInput {
    private WalletInput() {}

    public static void uuid(String value) {
        if (value == null
                || !value.matches(
                        "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_request", "请求标识无效。");
        }
    }

}
