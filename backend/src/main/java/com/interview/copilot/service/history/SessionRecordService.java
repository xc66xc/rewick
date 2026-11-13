package com.interview.copilot.service.history;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.response.history.RecordPageResponse;
import com.interview.copilot.response.history.RecordResponse;

public interface SessionRecordService {
    RecordPageResponse page(long user, long cursor);
    RecordPageResponse page(long user, long cursor, String resultFormat);

    RecordResponse read(long user, String record);
    RecordResponse read(long user, String record, String resultFormat);

    RecordResponse save(long user, String record, long version, String mutation, JsonNode content);

    void delete(long user, String record);
}
