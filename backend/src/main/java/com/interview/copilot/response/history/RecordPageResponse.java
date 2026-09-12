package com.interview.copilot.response.history;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;

public record RecordPageResponse(List<JsonNode> records, Long nextCursor) {}
