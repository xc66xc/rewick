package com.interview.copilot.common.questions;

import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

/** Nonpersonal speech example shared by policy, HTTP substitute and history regressions. */
public final class SpokenExtractionFixture {
    public static final String ORIGINAL = "然后我去看你有一个Reactor的一个SSE构建，也有一个流式执行链路。它里面会提到几个比较重要的概念，一个是ReAct模式。除了ReAct的模式之外，还有哪些这种常见的Agent的一些模式，这些模式？还有一个就是SSE，什么是SSE？以及MCP，除了SSE之外，还有哪些协议？";
    private static final List<String> QUESTIONS = List.of(
            "除了ReAct，还有哪些常见的Agent模式？", "什么是SSE？", "MCP除了SSE，还支持哪些传输方式？");
    private static final List<List<List<String>>> SOURCES = List.of(
            List.of(List.of("除了ReAct的模式之外，还有哪些这种常见的Agent的一些模式，这些模式？"),
                    List.of("还有一个就是SSE，什么是SSE？"), List.of("以及MCP，除了SSE之外，还有哪些协议？")),
            List.of(List.of("除了ReAct的模式之外，还有哪些这种常见的Agent的一些模式"),
                    List.of("什么是SSE？"), List.of("MCP，除了SSE之外，还有哪些协议？")),
            List.of(List.of("除了ReAct的模式之外", "有哪些这种常见的Agent的一些模式"),
                    List.of("SSE", "什么是SSE？"), List.of("MCP", "除了SSE之外，还有哪些协议？")));

    private SpokenExtractionFixture() {}

    public static List<Map<String, Object>> questions(int variant) {
        return IntStream.range(0, QUESTIONS.size()).mapToObj(index -> Map.<String, Object>of(
                "question", QUESTIONS.get(index), "sourceTexts", SOURCES.get(variant).get(index))).toList();
    }

    public static Map<String, Object> output(int variant) {
        return Map.of("action", "extracted", "questions", questions(variant));
    }
}
