package com.interview.copilot.common.references;

import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.api.Test;
class ReferenceAnalyzerTest {
    private final ReferenceAnalyzer analyzer = new ReferenceAnalyzer();
    @Test void frequencies_chineseAndTechnicalIdentifiers_preservesKeywords() {
        var terms = analyzer.frequencies("缓存击穿 Redis Redis C++ C# Node.js order_id");
        assertThat(terms).containsEntry("redis",2).containsKey("c++").containsKey("c#").containsKey("node.js").containsKey("order_id");
        assertThat(terms.keySet()).anyMatch(term -> term.contains("缓存"));
    }
    @Test void query_fullWidthIdentifiers_normalizesLikeIndexedTerms() {
        assertThat(analyzer.query("Ｒｅｄｉｓ Ｃ＋＋ ｏｒｄｅｒ＿ｉｄ"))
                .containsExactly("redis", "c++", "order_id");
    }
    @Test void query_punctuationOnly_returnsNoTerms() { assertThat(analyzer.query("...，。!?")).isEmpty(); }
}
