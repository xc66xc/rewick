package com.interview.copilot.auth;

import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import static org.assertj.core.api.Assertions.assertThat;

class PasswordRulesTest {
    @ParameterizedTest
    @MethodSource("passwordCases")
    void isValid_unicodeAndBcryptBoundaries_areEnforced(String password, boolean expected) {
        assertThat(PasswordRules.isValid(password)).isEqualTo(expected);
    }

    static Stream<Arguments> passwordCases() {
        return Stream.of(Arguments.of("a".repeat(12), true), Arguments.of("a".repeat(72), true),
                Arguments.of("a".repeat(73), false), Arguments.of("汉".repeat(24), true),
                Arguments.of("汉".repeat(25), false), Arguments.of("short", false),
                Arguments.of(" ".repeat(12), false), Arguments.of(null, false));
    }
}
