package com.interview.copilot.references;

import com.interview.copilot.common.ApiException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.assertj.core.api.Assertions.*;

class ReferenceParserTest {
    @TempDir Path directory;
    private final ReferenceParser parser=new ReferenceParser();
    @Test void parse_chineseText_preservesContentAndBoundedOverlappingChunks() throws Exception {
        Path file=directory.resolve("question.txt"); Files.writeString(file,"面试资料".repeat(450));
        var result=parser.parse(file,"question.txt");
        assertThat(result.chunks()).hasSize(3);
        assertThat(result.chunks()).allSatisfy(chunk -> assertThat(chunk.text().length()).isLessThanOrEqualTo(800));
        assertThat(result.chunks().get(0).text().substring(700)).isEqualTo(result.chunks().get(1).text().substring(0,100));
    }
    @Test void parse_pdf_preservesPageSources() throws Exception {
        Path file=directory.resolve("reference.pdf");
        try(var pdf=new PDDocument()) {
            for(int i=0;i<2;i++) {
                var page=new PDPage(); pdf.addPage(page);
                try(var content=new PDPageContentStream(pdf,page)) {
                    content.beginText(); content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA),12);
                    content.newLineAtOffset(30,700); content.showText("Page "+(i+1)); content.endText();
                }
            }
            pdf.save(file.toFile());
        }
        var result=parser.parse(file,"reference.pdf");
        assertThat(result.pageCount()).isEqualTo(2);
        assertThat(result.chunks()).extracting(ReferenceModels.Chunk::pageStart).containsExactly(1,2);
    }
    @Test void parse_emptyDocument_failsRatherThanMarkingReady() throws Exception {
        Path file=directory.resolve("empty.txt"); Files.writeString(file," \n\t");
        assertThatThrownBy(() -> parser.parse(file,"empty.txt")).isInstanceOf(ApiException.class);
    }
    @Test void parse_oversizedExtractedText_rejects() throws Exception {
        Path file=directory.resolve("large.txt"); Files.writeString(file,"中".repeat(2_000_001));
        assertThatThrownBy(() -> parser.parse(file,"large.txt")).isInstanceOf(ApiException.class);
    }
    @Test void parse_malformedPdf_rejects() throws Exception {
        Path file=directory.resolve("invalid.pdf"); Files.writeString(file,"not a PDF");
        assertThatThrownBy(() -> parser.parse(file,"invalid.pdf")).isInstanceOf(java.io.IOException.class);
    }
}
