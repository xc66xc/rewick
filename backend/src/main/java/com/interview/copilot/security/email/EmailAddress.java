package com.interview.copilot.security.email;

import com.interview.copilot.exception.ApiException;

import org.springframework.http.HttpStatus;

import java.util.Locale;
import java.util.regex.Pattern;

public final class EmailAddress {
    private static final Pattern LOCAL = Pattern.compile("[a-z0-9!#$%&'*+/=?^_`{|}~.-]+");
    private static final Pattern DOMAIN = Pattern.compile("[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?");

    private EmailAddress() {}

    public static String normalize(String input) {
        String value = input == null ? "" : input.strip().toLowerCase(Locale.ROOT);
        int separator = value.indexOf('@');
        if (value.length() > 254
                || separator < 1
                || separator > 64
                || separator != value.lastIndexOf('@')) throw invalid();
        String local = value.substring(0, separator);
        if (!LOCAL.matcher(local).matches()
                || local.startsWith(".")
                || local.endsWith(".")
                || local.contains("..")) throw invalid();
        String[] labels = value.substring(separator + 1).split("\\.", -1);
        if (labels.length < 2) throw invalid();
        for (String label : labels) if (!DOMAIN.matcher(label).matches()) throw invalid();
        return value;
    }

    private static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "invalid_email", "请输入有效的邮箱地址。");
    }
}
