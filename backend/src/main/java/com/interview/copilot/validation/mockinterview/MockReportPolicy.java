package com.interview.copilot.validation.mockinterview;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Set;

/** A generated quotation is accepted only when the candidate actually said it in that turn. */
public final class MockReportPolicy {
 private MockReportPolicy() {}
 public static void validate(JsonNode report,List<JsonNode> turns) {
  if(!report.isObject() || !report.path("summary").isTextual() || report.path("summary").asText().isBlank() || report.path("summary").asText().length()>4000) throw invalid();
  for(String name:List.of("strengths","improvements","coverage","nextPractice"))if(!report.path(name).isArray() || report.path(name).size()>30)throw invalid();
  for(String name:List.of("strengths","improvements"))for(JsonNode item:report.path(name))validateEvidence(item,turns);
  for(JsonNode item:report.path("coverage"))if(!Set.of("充分","部分","不足","未考察").contains(item.path("level").asText()) || item.path("reason").asText().length()>1000)throw invalid();
  for(JsonNode item:report.path("nextPractice"))if(!item.isTextual() || item.asText().isBlank() || item.asText().length()>500)throw invalid();
 }
 private static void validateEvidence(JsonNode item,List<JsonNode> turns) {
  String id=item.path("turnId").asText(),evidence=item.path("evidence").asText(),comment=item.path("comment").asText();
  if(evidence.isBlank() || evidence.length()>1000 || comment.isBlank() || comment.length()>1000)throw invalid();
  boolean supported=turns.stream().anyMatch(turn->id.equals(turn.path("id").asText()) && turn.path("answerText").asText().contains(evidence));
  if(!supported)throw invalid();
 }
 private static IllegalStateException invalid() {return new IllegalStateException("Mock report lacks valid evidence or required sections");}
}
