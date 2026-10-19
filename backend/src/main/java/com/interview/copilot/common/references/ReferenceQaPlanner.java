package com.interview.copilot.common.references;

import com.interview.copilot.model.references.ReferenceModels.Section;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/** Explicit question headings own their answer and nested non-question sections. */
public final class ReferenceQaPlanner {
    private static final Pattern QUESTION = Pattern.compile(
            "(?i).*[?？].*|^(?:Q\\s*\\d*|问题\\s*\\d*|问)\\s*[:：、.].+|.*(?:如何|为什么|怎么|怎样|哪些|什么|是否|谈谈|介绍一下|请介绍|自我介绍|离职原因|薪资期望|职业规划|反问面试官).*");
    private ReferenceQaPlanner() {}
    public static List<Section> assign(List<Section> input) {
        List<Section> result = new ArrayList<>();
        for (var section : input) {
            Integer inherited = section.parentOrdinal() == null ? null : result.get(section.parentOrdinal()).qaOrdinal();
            boolean question = section.level() > 0 && QUESTION.matcher(section.title()).matches();
            Integer owner = question ? Integer.valueOf(section.ordinal()) : inherited;
            String text = question ? questionText(section, input) : "";
            result.add(new Section(section.ordinal(), section.parentOrdinal(), section.level(), section.title(),
                    section.path(), section.introduction(), section.paragraphStart(), section.paragraphEnd(), owner, text));
        }
        var answered = result.stream().filter(s -> s.qaOrdinal() != null && !s.introduction().isBlank())
                .map(Section::qaOrdinal).collect(java.util.stream.Collectors.toSet());
        return result.stream().map(s -> answered.contains(s.ordinal()) || s.questionText().isBlank() ? s
                : new Section(s.ordinal(), s.parentOrdinal(), s.level(), s.title(), s.path(), s.introduction(),
                        s.paragraphStart(), s.paragraphEnd(), s.qaOrdinal(), "")).toList();
    }
    private static String questionText(Section section, List<Section> sections) {
        // Put the question first so truncation never drops the discriminating leaf title.
        String parent = section.parentOrdinal() == null ? "" : sections.get(section.parentOrdinal()).path();
        return ReferenceText.prefix(section.title() + (parent.isBlank() ? "" : "\n章节：" + parent), 1024);
    }
}
