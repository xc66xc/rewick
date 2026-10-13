package com.interview.copilot.common.references;

import com.interview.copilot.exception.references.ReferenceErrors;
import org.apache.lucene.analysis.cn.smart.SmartChineseAnalyzer;
import org.apache.lucene.analysis.tokenattributes.CharTermAttribute;
import org.springframework.stereotype.Component;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/** Versioned local analyzer shared by indexing and BM25 queries. */
@Component
public class ReferenceAnalyzer {
    public static final int VERSION = 1;
    private final SmartChineseAnalyzer analyzer = new SmartChineseAnalyzer();
    private static final Pattern IDENTIFIER = Pattern.compile("[A-Za-z][A-Za-z0-9]*(?:[.+#_][A-Za-z0-9+#_]*)*");
    public Map<String, Integer> frequencies(String text) {
        text = java.text.Normalizer.normalize(text, java.text.Normalizer.Form.NFKC);
        var terms = new LinkedHashMap<String, Integer>();
        var match = IDENTIFIER.matcher(text);
        var remainder = new StringBuilder(text);
        while (match.find()) {
            add(terms, match.group().toLowerCase(java.util.Locale.ROOT));
            for (int i = match.start(); i < match.end(); i++) remainder.setCharAt(i, ' ');
        }
        try (var stream = analyzer.tokenStream("text", remainder.toString())) {
            var token = stream.addAttribute(CharTermAttribute.class);
            stream.reset();
            while (stream.incrementToken()) add(terms, token.toString());
            stream.end();
        } catch (IOException error) { throw new IllegalStateException("资料分词失败。", error); }
        if (terms.size() > 800) throw ReferenceErrors.invalid("子片段词项超过限制。");
        return java.util.Collections.unmodifiableMap(terms);
    }
    public List<String> query(String text) {
        return frequencies(ReferenceText.prefix(text, 800)).keySet().stream().limit(32).toList();
    }
    @jakarta.annotation.PreDestroy public void close() { analyzer.close(); }
    private void add(Map<String, Integer> terms, String value) {
        if (value.length() > 128) throw ReferenceErrors.invalid("技术词长度超过限制。");
        if (value.codePoints().anyMatch(Character::isLetterOrDigit)) terms.merge(value, 1, Integer::sum);
    }
}
