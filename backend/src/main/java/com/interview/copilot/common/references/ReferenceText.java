package com.interview.copilot.common.references;

/** Shared Unicode-safe length boundaries for Java and desktop UTF-16 contracts. */
public final class ReferenceText {
    private ReferenceText() {}
    public static String prefix(String value, int maximum) {
        return value.substring(0, end(value, 0, Math.min(maximum, value.length())));
    }
    public static int end(String value, int start, int target) {
        int end = Math.min(target, value.length());
        if (end > start && end < value.length() && Character.isHighSurrogate(value.charAt(end - 1))) end--;
        return end;
    }
}
