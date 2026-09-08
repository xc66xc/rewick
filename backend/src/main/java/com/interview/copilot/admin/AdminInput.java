package com.interview.copilot.admin;

import com.interview.copilot.common.ApiException;
import org.springframework.http.HttpStatus;

public final class AdminInput {
    private AdminInput() {}

    public static long id(String value) {
        try {
            if (value == null || !value.matches("[1-9][0-9]{0,18}")) throw invalid();
            return Long.parseLong(value);
        } catch (NumberFormatException error) {
            throw invalid();
        }
    }

    public static Paging paging(String page, String size) {
        try {
            int pageNumber = Integer.parseInt(page);
            int pageSize = Integer.parseInt(size);
            if (pageNumber < 1 || pageNumber > 10000 || pageSize < 1 || pageSize > 100) throw invalid();
            return new Paging(pageNumber, pageSize);
        } catch (NumberFormatException error) {
            throw invalid();
        }
    }

    public static String bounded(String value, int maximum) {
        if (value == null || value.length() > maximum || value.chars().anyMatch(Character::isISOControl)) throw invalid();
        return value;
    }

    public static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "invalid_request", "请求格式或参数无效。");
    }

    public record Paging(int page, int size) {
        public int offset() { return (page - 1) * size; }
    }
}
