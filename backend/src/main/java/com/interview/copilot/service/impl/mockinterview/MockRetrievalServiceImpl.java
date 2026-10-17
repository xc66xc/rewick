package com.interview.copilot.service.impl.mockinterview;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.service.mockinterview.MockRetrievalService;
import com.interview.copilot.service.platform.DesktopSettingsService;
import com.interview.copilot.service.platform.PlatformRuntimeService;
import com.interview.copilot.service.references.ReferenceHybridService;
import com.interview.copilot.util.ai.ProviderHttpClient;
import org.springframework.stereotype.Service;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/** Uses the platform routing exclusively; never borrows an assist usage lease. */
@Service
public class MockRetrievalServiceImpl implements MockRetrievalService {
 private final DesktopSettingsService desktop;
 private final PlatformRuntimeService platform;
 private final ProviderHttpClient http;
 private final ReferenceHybridService hybrid;
 private final ObjectMapper json;
 public MockRetrievalServiceImpl(DesktopSettingsService desktop,PlatformRuntimeService platform,ProviderHttpClient http,ReferenceHybridService hybrid,ObjectMapper json) {
  this.desktop=desktop;this.platform=platform;this.http=http;this.hybrid=hybrid;this.json=json;
 }
 public JsonNode retrieve(long user,String query,List<String> ids) {
  var defaults=desktop.get();
  if(!"remote".equals(defaults.retrievalMode())) {
   if(ids.isEmpty())return json.createObjectNode().put("status","disabled");
   return json.valueToTree(hybrid.retrieve(user,query,ids,null));
  }
  var config=platform.snapshot().knowledge(defaults.knowledgeServiceId());
  JsonNode response=http.json(config,Map.of("query",query,"agent_id",config.getAgentId(),"images",List.of()),Duration.ofSeconds(Math.min(8,config.getTimeoutSeconds()))).block(Duration.ofSeconds(9));
  if(response==null || !response.path("success").asBoolean() || !response.path("data").path("nodes").isArray()) throw new IllegalStateException("Remote mock retrieval failed");
  var result=json.createObjectNode().put("source","remote");var excerpts=result.putArray("excerpts");int budget=6000;
  for(JsonNode node:response.path("data").path("nodes")) {
   String text=node.path("text").asText().strip();
   if(text.isBlank())continue;if(budget<=0 || excerpts.size()>=3)break;
   text=text.substring(0,Math.min(text.length(),Math.min(2000,budget)));budget-=text.length();
   excerpts.addObject().put("text",text);
  }
  return result;
 }
}
