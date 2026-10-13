package com.interview.copilot.common.references;

import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.exception.references.ReferenceErrors;
import com.interview.copilot.model.references.ReferenceModels;
import org.springframework.stereotype.Component;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;

/** Parses supported MD/Word sources with the frozen index policy. */
@Component
public class ReferenceParser {
    private final MarkdownSectionParser markdown;
    private final WordSectionParser word;
    private final ReferenceChunkPlanner planner;
    public ReferenceParser(MarkdownSectionParser markdown, WordSectionParser word, ReferenceChunkPlanner planner) {
        this.markdown = markdown;
        this.word = word;
        this.planner = planner;
    }
    public ReferenceModels.Parsed parse(Path path, String name, ReferencePolicy policy) throws IOException {
        String format = name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        if (!java.util.Set.of("md", "doc", "docx").contains(format)) throw ReferenceErrors.invalid("参考资料仅支持 Markdown 和 Word。");
        var blocks = format.equals("md")
                ? markdown.parse(Files.readString(path, StandardCharsets.UTF_8).replace("\u0000", "").replace("\r\n", "\n"))
                : word.parse(path, format);
        return planner.plan(blocks, format, policy);
    }
}
