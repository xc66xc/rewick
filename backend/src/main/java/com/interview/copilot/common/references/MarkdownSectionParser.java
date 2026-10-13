package com.interview.copilot.common.references;

import com.interview.copilot.model.references.ReferenceModels.Block;
import org.commonmark.ext.gfm.tables.TablesExtension;
import org.commonmark.node.Heading;
import org.commonmark.parser.IncludeSourceSpans;
import org.commonmark.parser.Parser;
import org.springframework.stereotype.Component;
import java.util.ArrayList;
import java.util.List;

/** Parses only document-level headings; source slices retain code and table syntax. */
@Component
public class MarkdownSectionParser {
    public List<Block> parse(String text) {
        if (text.length() > 2_000_000) throw com.interview.copilot.exception.references.ReferenceErrors.invalid("解析正文超过 200 万字符。");
        var parser = Parser.builder().extensions(List.of(TablesExtension.create()))
                .includeSourceSpans(IncludeSourceSpans.BLOCKS).build();
        var root = parser.parse(text);
        var lines = text.split("\n", -1);
        List<Block> blocks = new ArrayList<>();
        for (var node = root.getFirstChild(); node != null; node = node.getNext()) {
            var spans = node.getSourceSpans();
            if (spans.isEmpty()) continue;
            int first = spans.getFirst().getLineIndex();
            int last = spans.getLast().getLineIndex();
            String value = String.join("\n", java.util.Arrays.copyOfRange(lines, first, last + 1));
            blocks.add(new Block(value, node instanceof Heading h ? h.getLevel() : 0, first + 1));
        }
        return List.copyOf(blocks);
    }
}
