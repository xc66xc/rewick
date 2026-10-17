package com.interview.copilot.service.mockinterview;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

public interface MockRetrievalService {
 JsonNode retrieve(long user,String query,List<String> ids);
}
