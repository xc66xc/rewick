package com.interview.copilot.common.references;

import java.util.ArrayList;
import java.util.List;

/** Splits structural blocks at line/sentence boundaries, retaining table/code labels. */
public final class ReferenceBlockSplitter {
    private ReferenceBlockSplitter() {}
    public static List<String> split(String text, int maximum, int overlap) {
        String prefix = "";
        String suffix = "";
        String content = text;
        if (text.startsWith("```") || text.startsWith("~~~")) {
            int line = text.indexOf('\n');
            if (line >= 0 && line < Math.min(100, maximum / 3)) {
                prefix = text.substring(0, line + 1);
                suffix = "\n" + text.substring(0, 3);
                content = text.substring(line + 1);
                int close = content.lastIndexOf(suffix);
                if (close >= 0) content = content.substring(0, close);
            }
        } else if (text.stripLeading().startsWith("|")) {
            int line = text.indexOf('\n');
            if (line >= 0 && line < maximum / 3) {
                prefix = text.substring(0, line + 1);
                content = text.substring(line + 1);
            }
        }
        int capacity = maximum - prefix.length() - suffix.length();
        List<String> result = new ArrayList<>();
        int offset = 0;
        while (offset < content.length()) {
            int end = ReferenceText.end(content, offset, offset + capacity);
            if (end < content.length()) end = boundary(content, offset, end);
            result.add(prefix + content.substring(offset, end) + suffix);
            if (end == content.length()) break;
            int next = end - Math.min(Math.min(overlap, capacity / 4), Math.max(0, end - offset - 1));
            if (next > 0 && Character.isLowSurrogate(content.charAt(next))) next++;
            offset = next;
        }
        if (result.isEmpty() && !text.isBlank()) result.add(text);
        return List.copyOf(result);
    }
    private static int boundary(String text, int start, int end) {
        for (int i = end - 1; i > start + (end - start) / 2; i--) {
            if ("\n。！？；.!?;".indexOf(text.charAt(i)) >= 0) return i + 1;
        }
        return end;
    }
}
