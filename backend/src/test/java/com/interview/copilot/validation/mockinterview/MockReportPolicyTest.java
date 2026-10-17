package com.interview.copilot.validation.mockinterview;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import java.util.List;

class MockReportPolicyTest {
 private final ObjectMapper json=new ObjectMapper();
 private ObjectNode report(String id,String quote) {
  var result=json.createObjectNode().put("summary","本次考察了缓存设计。");
  result.putArray("strengths").addObject().put("turnId",id).put("evidence",quote).put("comment","说明了实现方式。");
  result.putArray("improvements");result.putArray("coverage").addObject().put("topicId","cache").put("level","部分").put("reason","未解释故障恢复。");result.putArray("nextPractice").add("练习缓存失效后的恢复流程。");return result;
 }
 private List<JsonNode> turns() {return List.of(json.createObjectNode().put("id","turn-1").put("question","如何保证一致性？").put("answerText","我通过更新数据库后删除缓存保证最终一致性。"));}
 @Test void report_exactCandidateQuote_isAccepted() {
  assertThatCode(()->MockReportPolicy.validate(report("turn-1","更新数据库后删除缓存"),turns())).doesNotThrowAnyException();
 }
 @Test void report_fabricatedQuote_isRejected() {
  assertThatThrownBy(()->MockReportPolicy.validate(report("turn-1","性能提升了百分之九十"),turns())).isInstanceOf(IllegalStateException.class);
 }
 @Test void report_unknownTurnCannotBorrowOtherAnswer_isRejected() {
  assertThatThrownBy(()->MockReportPolicy.validate(report("other-user-turn","更新数据库后删除缓存"),turns())).isInstanceOf(IllegalStateException.class);
 }
 @Test void report_interviewerWordsAreNotCandidateEvidence_isRejected() {
  assertThatThrownBy(()->MockReportPolicy.validate(report("turn-1","如何保证一致性"),turns())).isInstanceOf(IllegalStateException.class);
 }
 @Test void report_missingSections_isRejected() {
  assertThatThrownBy(()->MockReportPolicy.validate(json.createObjectNode().put("summary","仅摘要"),turns())).isInstanceOf(IllegalStateException.class);
 }
}
