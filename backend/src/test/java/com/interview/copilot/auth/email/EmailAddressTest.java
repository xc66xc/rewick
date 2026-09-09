package com.interview.copilot.auth.email;

import com.interview.copilot.common.ApiException;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EmailAddressTest {
    @ParameterizedTest
    @CsvSource({"' Alice+Job@Example.COM ',alice+job@example.com", "a.b@example.cn,a.b@example.cn", "user@sub.example.com,user@sub.example.com"})
    void normalize_validEmail_preservesAddressWhileFoldingCase(String input, String expected) {
        assertThat(EmailAddress.normalize(input)).isEqualTo(expected);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "name", "a@localhost", "a@@example.com", ".a@example.com", "a..b@example.com", "a@-example.com", "a@example.com\r\nBcc:x@y.com", "a b@example.com", "用户@example.com"})
    void normalize_invalidAddress_rejectsUnsafeOrAmbiguousInput(String input) {
        assertThatThrownBy(() -> EmailAddress.normalize(input)).isInstanceOf(ApiException.class);
    }
}
