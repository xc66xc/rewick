package com.interview.copilot.admin;

import java.util.List;

public record Page<T>(List<T> items, long total, int page, int size) {}
