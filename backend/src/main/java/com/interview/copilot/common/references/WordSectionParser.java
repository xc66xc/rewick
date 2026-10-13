package com.interview.copilot.common.references;

import com.interview.copilot.exception.references.ReferenceErrors;
import com.interview.copilot.model.references.ReferenceModels.Block;
import org.apache.poi.hwpf.HWPFDocument;
import org.apache.poi.hwpf.usermodel.TableIterator;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.springframework.stereotype.Component;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.zip.ZipFile;

/** Reads Word paragraph/heading styles and ordered tables without rendering pages. */
@Component
public class WordSectionParser {
    public List<Block> parse(Path path, String format) throws IOException {
        return format.equals("docx") ? docx(path) : doc(path);
    }
    private List<Block> docx(Path path) throws IOException {
        checkArchive(path);
        try (var input = Files.newInputStream(path); var document = new XWPFDocument(input)) {
            List<Block> result = new ArrayList<>();
            for (var item : document.getBodyElements()) {
                if (item instanceof XWPFParagraph paragraph) {
                    result.add(new Block(paragraph.getText(), level(paragraph, document), result.size() + 1));
                } else if (item instanceof XWPFTable table) {
                    appendTable(table, result, 0);
                }
            }
            return List.copyOf(result);
        }
    }
    private void checkArchive(Path path) throws IOException {
        try (var zip = new ZipFile(path.toFile())) {
            if (zip.size() > 10000) throw ReferenceErrors.invalid("Word 压缩条目超过限制。");
            long size = 0;
            var entries = zip.entries();
            while (entries.hasMoreElements()) {
                long length = entries.nextElement().getSize();
                if (length < 0) throw ReferenceErrors.invalid("Word 压缩条目大小无效。");
                size += length;
                if (size > 64L * 1024 * 1024) throw ReferenceErrors.invalid("Word 解压正文超过限制。");
            }
        }
    }
    private int level(XWPFParagraph paragraph, XWPFDocument document) {
        var properties = paragraph.getCTP().getPPr();
        if (properties != null && properties.isSetOutlineLvl()) return outline(properties.getOutlineLvl().getVal().intValue());
        var styles = document.getStyles();
        String id = paragraph.getStyleID();
        var visited = new HashSet<String>();
        while (styles != null && id != null && visited.size() < 10 && visited.add(id)) {
            var style = styles.getStyle(id);
            if (style == null) break;
            var p = style.getCTStyle().getPPr();
            if (p != null && p.isSetOutlineLvl()) return outline(p.getOutlineLvl().getVal().intValue());
            int named = namedLevel(style.getName(), id);
            if (named > 0) return named;
            id = style.getBasisStyleID();
        }
        return 0;
    }
    private int outline(int value) { return value >= 0 && value <= 8 ? value + 1 : 0; }
    private int namedLevel(String name, String id) {
        String value = name == null ? id : name;
        var match = java.util.regex.Pattern.compile("(?i)(?:heading|标题)\\s*([1-9])").matcher(value);
        return match.matches() ? Integer.parseInt(match.group(1)) : 0;
    }
    private void appendTable(XWPFTable table, List<Block> result, int depth) {
        if (depth >= 8) throw ReferenceErrors.invalid("Word 表格嵌套超过限制。");
        for (var row : table.getRows()) {
            result.add(new Block("| " + String.join(" | ", row.getTableCells().stream()
                    .map(cell -> cell.getParagraphs().stream().map(XWPFParagraph::getText)
                            .collect(java.util.stream.Collectors.joining(" "))).toList()) + " |", 0, result.size() + 1));
            for (var cell : row.getTableCells()) for (var nested : cell.getTables()) appendTable(nested, result, depth + 1);
        }
    }
    private List<Block> doc(Path path) throws IOException {
        try (var input = Files.newInputStream(path); var document = new HWPFDocument(input)) {
            var range = document.getRange();
            List<Block> result = new ArrayList<>();
            var tables = new TableIterator(range);
            var table = tables.hasNext() ? tables.next() : null;
            for (int index = 0; index < range.numParagraphs(); index++) {
                var paragraph = range.getParagraph(index);
                if (table != null && paragraph.getStartOffset() >= table.getStartOffset()) {
                    for (int r = 0; r < table.numRows(); r++) {
                        var row = table.getRow(r);
                        List<String> cells = new ArrayList<>();
                        for (int c = 0; c < row.numCells(); c++) cells.add(row.getCell(c).text().replace('\u0007', ' ').strip());
                        result.add(new Block("| " + String.join(" | ", cells) + " |", 0, index + 1));
                    }
                    while (index + 1 < range.numParagraphs() && range.getParagraph(index + 1).getStartOffset() < table.getEndOffset()) index++;
                    table = tables.hasNext() ? tables.next() : null;
                    continue;
                }
                int level = paragraph.getLvl();
                result.add(new Block(paragraph.text(), outline(level), index + 1));
            }
            return List.copyOf(result);
        }
    }
}
