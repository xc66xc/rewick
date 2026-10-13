package com.interview.copilot.common.references;

import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.exception.references.ReferenceErrors;
import com.interview.copilot.model.references.ReferenceModels;
import org.springframework.stereotype.Component;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

/** Builds one heading tree, bounded parent contexts and shared lexical/vector children. */
@Component
public class ReferenceChunkPlanner {
    public ReferenceModels.Parsed plan(List<ReferenceModels.Block> input, String format, ReferencePolicy policy) {
        List<ReferenceModels.Section> sections = new ArrayList<>();
        List<ReferenceModels.Context> contexts = new ArrayList<>();
        List<ReferenceModels.Chunk> chunks = new ArrayList<>();
        var stack = new ArrayDeque<ReferenceModels.Section>();
        List<ReferenceModels.Block> body = new ArrayList<>();
        ReferenceModels.Block heading = new ReferenceModels.Block("", 0, 1);
        int characters = 0;
        for (var block : input) {
            characters += block.text().length();
            if (characters > 2_000_000) throw ReferenceErrors.invalid("解析正文超过 200 万字符。");
            if (block.headingLevel() > 0) {
                append(heading, body, stack, sections, contexts, chunks, policy);
                body.clear();
                heading = block;
            } else if (!block.text().isBlank()) body.add(block);
        }
        append(heading, body, stack, sections, contexts, chunks, policy);
        if (chunks.isEmpty()) throw ReferenceErrors.invalid("没有可提取的资料正文。");
        String mode = sections.stream().anyMatch(section -> section.level() > 0) ? "headings" : "paragraphs";
        return new ReferenceModels.Parsed(List.copyOf(sections), List.copyOf(contexts), List.copyOf(chunks), format, mode);
    }
    private void append(ReferenceModels.Block heading, List<ReferenceModels.Block> body,
            ArrayDeque<ReferenceModels.Section> stack, List<ReferenceModels.Section> sections,
            List<ReferenceModels.Context> contexts, List<ReferenceModels.Chunk> chunks, ReferencePolicy policy) {
        if (heading.headingLevel() == 0 && body.isEmpty()) return;
        while (!stack.isEmpty() && stack.peek().level() >= heading.headingLevel()) stack.pop();
        String title = title(heading.text());
        String path = path(stack.isEmpty() ? "" : stack.peek().path(), title);
        String text = String.join("\n\n", body.stream().map(ReferenceModels.Block::text).toList());
        int end = body.isEmpty() ? heading.paragraph() : body.getLast().paragraph();
        var section = new ReferenceModels.Section(sections.size(), stack.isEmpty() ? null : stack.peek().ordinal(),
                heading.headingLevel(), ReferenceText.prefix(title, 512), path, text, heading.paragraph(), end);
        if (sections.size() >= 5000) throw ReferenceErrors.invalid("章节数量超过限制。");
        sections.add(section);
        if (section.level() > 0) stack.push(section);
        StringBuilder current = new StringBuilder();
        int first = body.isEmpty() ? end : body.getFirst().paragraph();
        int last = first;
        for (var block : body) {
            for (String piece : ReferenceBlockSplitter.split(block.text(), 1600, 0)) {
                if (!current.isEmpty() && current.length() + piece.length() + 2 > policy.parentTarget()) {
                    context(section, current.toString(), first, last, text.length() > 1600, contexts, chunks, policy);
                    current.setLength(0);
                }
                if (current.isEmpty()) first = block.paragraph();
                if (!current.isEmpty()) current.append("\n\n");
                current.append(piece);
                last = block.paragraph();
            }
        }
        if (!current.isEmpty()) context(section, current.toString(), first, last, text.length() > 1600, contexts, chunks, policy);
        if (sections.size() > 5000 || contexts.size() > 5000 || chunks.size() > 5000) throw ReferenceErrors.invalid("单份资料分片数量超过 5000。");
    }
    private void context(ReferenceModels.Section section, String text, int first, int last, boolean split,
            List<ReferenceModels.Context> contexts, List<ReferenceModels.Chunk> chunks, ReferencePolicy policy) {
        if (contexts.size() >= 5000) throw ReferenceErrors.invalid("上下文数量超过限制。");
        int ordinal = contexts.size();
        contexts.add(new ReferenceModels.Context(ordinal, section.ordinal(), text, first, last, split));
        String label = section.path().isBlank() ? "" : ReferenceText.prefix(section.path(), 158) + "\n";
        int capacity = Math.min(policy.childTarget(), 800 - label.length());
        for (String piece : ReferenceBlockSplitter.split(text, capacity, policy.childOverlap())) {
            if (chunks.size() >= 5000) throw ReferenceErrors.invalid("子片段数量超过限制。");
            chunks.add(new ReferenceModels.Chunk(chunks.size(), ordinal, label + piece, first, last));
        }
    }
    private String path(String parent, String title) {
        String leaf = ReferenceText.prefix(title, 512);
        if (parent.isBlank() || leaf.length() >= 500) return leaf;
        return ReferenceText.prefix(parent, Math.max(0, 509 - leaf.length())) + " → " + leaf;
    }
    private String title(String value) {
        return value.replaceFirst("^ {0,3}#{1,6}\\s+", "").replaceFirst("\\n[=-]+\\s*$", "")
                .replaceFirst("\\s+#+\\s*$", "").strip();
    }
}
