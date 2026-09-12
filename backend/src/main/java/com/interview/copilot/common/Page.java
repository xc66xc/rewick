package com.interview.copilot.common;

import java.util.function.Function;
import java.util.List;

public record Page<T>(List<T> items, long total, int page, int size) {
    public <R> Page<R> map(Function<? super T, ? extends R> converter) {
        List<R> converted = items.stream().<R>map(converter).toList();
        return new Page<>(converted, total, page, size);
    }
}
