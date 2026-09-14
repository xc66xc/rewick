package com.interview.copilot.util;

import com.interview.copilot.exception.ApiException;
import org.junit.jupiter.api.Test;
import java.util.HashMap;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 验证 ZPAY 原文排序签名和篡改拒绝。
 */
class ZpaySignatureTest {
    @Test
    void sign_unicodeAndReservedCharacters_usesRawUtf8SortedValues() {
        var parameters = new HashMap<>(Map.of("pid", "123", "name", "套餐 A&B", "money", "1.20"));
        parameters.put("sign", "ignored");
        parameters.put("sign_type", "MD5");
        parameters.put("empty", "");
        parameters.put("null", null);

        assertThat(ZpaySignature.sign(parameters, "secret")).isEqualTo("535d6fa2741b077591a27362552d747f");
    }

    @Test
    void verify_changedAmount_rejectsSignature() {
        var parameters = new HashMap<>(Map.of("money", "1.20", "sign_type", "MD5"));
        parameters.put("sign", ZpaySignature.sign(parameters, "secret"));
        parameters.put("money", "1.21");

        assertThatThrownBy(() -> ZpaySignature.verify(parameters, "secret")).isInstanceOf(ApiException.class);
    }
}
