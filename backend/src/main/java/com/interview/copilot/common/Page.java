package com.interview.copilot.common;

import java.util.List;

public record Page<T>(List<T> items, long total, int page, int size) {}
