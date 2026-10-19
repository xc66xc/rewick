package com.interview.copilot.service.impl.mockinterview;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.service.mockinterview.MockRetrievalService;
import com.interview.copilot.service.references.ReferenceHybridService;
import org.springframework.stereotype.Service;

import java.util.List;

/** Uses platform reference retrieval without borrowing an assist usage lease. */
@Service
public class MockRetrievalServiceImpl implements MockRetrievalService {
    private final ReferenceHybridService hybrid;
    private final ObjectMapper json;

    public MockRetrievalServiceImpl(ReferenceHybridService hybrid, ObjectMapper json) {
        this.hybrid = hybrid;
        this.json = json;
    }

    public JsonNode retrieve(long user, String query, List<String> ids) {
        if (ids.isEmpty()) {
            return json.createObjectNode().put("status", "disabled");
        }
        return json.valueToTree(hybrid.retrieve(user, query, ids, null));
    }
}
