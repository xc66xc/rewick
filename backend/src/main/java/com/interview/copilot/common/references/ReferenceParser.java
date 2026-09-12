package com.interview.copilot.common.references;

import com.interview.copilot.exception.references.ReferenceErrors;
import com.interview.copilot.model.references.ReferenceModels;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Component
public class ReferenceParser {
    public ReferenceModels.Parsed parse(Path path, String name) throws IOException {
        List<String> pages =
                name.toLowerCase(Locale.ROOT).endsWith(".pdf")
                        ? pdf(path)
                        : List.of(Files.readString(path, StandardCharsets.UTF_8));
        List<ReferenceModels.Chunk> chunks = new ArrayList<>();
        int characters = 0;
        for (int page = 0; page < pages.size(); page++) {
            String text = pages.get(page).replace("\u0000", "").strip();
            characters += text.length();
            if (characters > 2_000_000) {
                throw ReferenceErrors.invalid("解析正文超过 200 万字符。");
            }
            split(text, page + 1, chunks);
        }
        if (chunks.isEmpty()) {
            throw ReferenceErrors.invalid("没有可提取的正文，扫描 PDF 请先进行 OCR。");
        }
        return new ReferenceModels.Parsed(List.copyOf(chunks), pages.size());
    }

    private List<String> pdf(Path path) throws IOException {
        try (var document = Loader.loadPDF(path.toFile())) {
            if (document.getNumberOfPages() > 500 || document.isEncrypted()) {
                throw ReferenceErrors.invalid("PDF 超过 500 页或受到密码保护。");
            }
            List<String> pages = new ArrayList<>();
            PDFTextStripper stripper = new PDFTextStripper();
            for (int page = 1; page <= document.getNumberOfPages(); page++) {
                stripper.setStartPage(page);
                stripper.setEndPage(page);
                pages.add(stripper.getText(document));
            }
            return pages;
        }
    }

    private void split(String text, int page, List<ReferenceModels.Chunk> chunks) {
        int offset = 0;
        while (offset < text.length()) {
            int end = Math.min(offset + 800, text.length());
            String value = text.substring(offset, end).strip();
            if (!value.isEmpty()) {
                chunks.add(new ReferenceModels.Chunk(chunks.size(), value, page, page));
            }
            if (chunks.size() > 5000) {
                throw ReferenceErrors.invalid("单份资料最多支持 5000 个分段。");
            }
            if (end == text.length()) {
                break;
            }
            offset = end - 100;
        }
    }
}
