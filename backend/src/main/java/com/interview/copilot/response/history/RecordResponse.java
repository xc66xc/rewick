package com.interview.copilot.response.history;

import com.fasterxml.jackson.databind.JsonNode;

public record RecordResponse(long version, JsonNode record) {}
