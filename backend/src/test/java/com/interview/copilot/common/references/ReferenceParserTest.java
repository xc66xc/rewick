package com.interview.copilot.common.references;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.exception.ApiException;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFStyle;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTStyle;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.math.BigInteger;

class ReferenceParserTest {
    @TempDir Path directory;
    private final ReferenceParser parser = new ReferenceParser(new MarkdownSectionParser(), new WordSectionParser(), new ReferenceChunkPlanner());
    @Test void markdown_titlesAndCode_preservesParentRelationships() throws Exception {
        var result = markdown("# 缓存设计\n背景介绍。\n## 缓存击穿\n热点过期时使用互斥锁。\n```java\n# 这不是标题\n```\n## 缓存雪崩\n设置随机过期时间。");
        assertThat(result.sections()).hasSize(3);
        assertThat(result.sections().get(1).parentOrdinal()).isEqualTo(0);
        assertThat(result.contexts().get(1).text()).contains("热点过期", "# 这不是标题");
        assertThat(result.sections().get(1).path()).isEqualTo("缓存设计 → 缓存击穿");
    }
    @Test void markdown_setextAndRepeatedTitles_usesUniqueSections() throws Exception {
        var result = markdown("主题\n===\n介绍\n## 同名\n内容一\n## 同名\n内容二");
        assertThat(result.sections()).hasSize(3);
        assertThat(result.sections().getFirst().title()).isEqualTo("主题");
        assertThat(result.contexts()).extracting(c -> c.sectionOrdinal()).containsExactly(0,1,2);
    }
    @Test void markdown_longChineseAndEmoji_hasBoundedUnicodeSafeChildren() throws Exception {
        var result = markdown("# 主题\n" + "中文😀".repeat(800));
        assertThat(result.chunks()).allSatisfy(c -> {
            assertThat(c.text().length()).isLessThanOrEqualTo(800);
            assertThat(Character.isHighSurrogate(c.text().charAt(c.text().length()-1))).isFalse();
        });
        assertThat(result.contexts()).allSatisfy(c -> assertThat(c.text().length()).isLessThanOrEqualTo(1600));
    }
    @Test void markdown_noHeadings_keepsParagraphMode() throws Exception {
        var result = markdown("第一段。\n\n第二段。");
        assertThat(result.headingMode()).isEqualTo("paragraphs");
        assertThat(result.sections().getFirst().introduction()).contains("第一段", "第二段");
    }
    @Test void word_stylesAndTables_preserveHeadingAndOrder() throws Exception {
        Path file = directory.resolve("test.docx");
        try (var doc = new XWPFDocument()) {
            var style = CTStyle.Factory.newInstance();
            style.setStyleId("CustomHeading");
            style.addNewPPr().addNewOutlineLvl().setVal(BigInteger.ONE);
            doc.createStyles().addStyle(new XWPFStyle(style));
            var h = doc.createParagraph(); h.setStyle("CustomHeading"); h.createRun().setText("缓存击穿");
            doc.createParagraph().createRun().setText("热点请求。");
            doc.createTable(1,2).getRow(0).getCell(0).setText("互斥锁");
            doc.createParagraph().createRun().setText("逻辑过期。");
            try (var output = Files.newOutputStream(file)) { doc.write(output); }
        }
        var result = parser.parse(file, "test.docx", ReferencePolicy.defaults());
        assertThat(result.sections().getFirst().level()).isEqualTo(2);
        assertThat(result.sections().getFirst().introduction()).containsSubsequence("热点请求", "互斥锁", "逻辑过期");
        assertThat(result.format()).isEqualTo("docx");
    }
    @Test void word_binaryDoc_readsRealWordText() throws Exception {
        var result = parser.parse(Path.of("src/test/resources/references/simple.doc"), "simple.doc", ReferencePolicy.defaults());
        assertThat(result.format()).isEqualTo("doc");
        assertThat(result.chunks()).isNotEmpty();
        assertThat(result.sections().getFirst().introduction()).contains("This is a simple file");
    }
    @ParameterizedTest @ValueSource(strings={"a.txt","a.pdf","a.docm"})
    void parse_unsupportedFormats_rejects(String name) throws Exception {
        Path file = directory.resolve(name); Files.writeString(file, "资料");
        assertThatThrownBy(() -> parser.parse(file, name, ReferencePolicy.defaults())).isInstanceOf(ApiException.class);
    }
    @Test void parse_emptyAndOversize_rejects() throws Exception {
        assertThatThrownBy(() -> markdown(" \n")).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> markdown("中".repeat(2_000_001))).isInstanceOf(ApiException.class);
    }
    @Test void qa_nestedAnswerSections_shareQuestionButNextQuestionIsIndependent() throws Exception {
        var result = markdown("# 面试题库\n## 你还有什么其他问题吗？\n可以反问团队。\n### 技术挑战\n询问技术债。\n## 为什么离职？\n说明发展目标。");
        assertThat(result.sections().get(1).questionText()).startsWith("你还有什么其他问题吗？").contains("面试题库");
        assertThat(result.sections().get(2).qaOrdinal()).isEqualTo(1);
        assertThat(result.sections().get(2).questionText()).isEmpty();
        assertThat(result.sections().get(3).qaOrdinal()).isEqualTo(3);
    }
    @Test void qa_broadHeadingsAndCode_doNotBecomeQuestionUnits() throws Exception {
        var result = markdown("# 项目经验\n项目描述。\n## Redis\n```text\n# 如何实现缓存？\n```\n技术原理。");
        assertThat(result.sections()).allSatisfy(section -> {
            assertThat(section.qaOrdinal()).isNull();
            assertThat(section.questionText()).isEmpty();
        });
    }
    @Test void qa_numberedQuestionWithoutQuestionMark_isRecognized() throws Exception {
        var result = markdown("## Q1：Redis持久化\n使用AOF。");
        assertThat(result.sections().getFirst().questionText()).startsWith("Q1：Redis持久化");
    }
    private com.interview.copilot.model.references.ReferenceModels.Parsed markdown(String value) throws Exception {
        Path file = directory.resolve("sample.md"); Files.writeString(file, value);
        return parser.parse(file, "sample.md", ReferencePolicy.defaults());
    }
}
