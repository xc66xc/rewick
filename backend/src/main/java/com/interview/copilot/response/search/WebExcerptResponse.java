package com.interview.copilot.response.search;

@com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
public record WebExcerptResponse(
        String source, String kind, String documentId, String chunkId, int revision,
        String name, String title, String url, String text, Double score) {}
