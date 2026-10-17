package com.interview.copilot.service.impl.mockinterview;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.util.MockJson;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.mapper.mockinterview.MockWalletMapper;
import com.interview.copilot.service.mockinterview.MockWalletService;
import com.interview.copilot.service.mockinterview.MockMeterService;
import com.interview.copilot.validation.mockinterview.MockInput;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class MockWalletServiceImpl implements MockWalletService {
 private final MockWalletMapper records;
 private final ObjectMapper json;
 private final MockMeterService meter;
 public MockWalletServiceImpl(MockWalletMapper records,ObjectMapper json,MockMeterService meter) {this.records=records;this.json=json;this.meter=meter;}
 public JsonNode state(long user) {
  lock(user);
  var active=records.active(user);if(active!=null)meter.settle(user,active.sessionId());
  var wallet=records.wallet(user);
  return json.createObjectNode().put("availableSeconds",wallet.availableSeconds()).put("version",wallet.version());
 }
 public JsonNode ledger(long user,Long cursor) {
  var result=json.createObjectNode();
  var items=result.putArray("items");
  records.ledger(user,cursor).forEach(value->items.add(MockJson.parse(json,value)));
  if(items.size()==50) result.put("nextCursor",items.get(49).path("id").asLong());
  return result;
 }
 public JsonNode adjust(long actor,long user,JsonNode input) {
  String request=MockInput.uuid(input,"requestId");
  long delta=MockInput.range(input,"deltaSeconds",-31536000,31536000);
  String reason=input.path("reason").asText().strip();
  if(delta==0 || reason.isBlank() || reason.length()>200) throw MockInput.error("mock_invalid_input","请输入非零时长和调整原因。");
  lock(user);
  String previous=records.adjustment(user,request);
  if(previous!=null) {
   JsonNode value=MockJson.parse(json,previous);
   if(value.path("deltaSeconds").asLong()!=delta || !value.path("reason").asText().equals(reason)) throw MockInput.error("mock_idempotency_conflict","相同请求不能使用不同调整内容。");
   return state(user);
  }
  var active=records.active(user);if(active!=null)meter.settle(user,active.sessionId());
  long balance=Math.addExact(records.wallet(user).availableSeconds(),delta);
  if(balance<0) throw MockInput.error("mock_balance_insufficient","模拟余额不足，不能扣成负数。");
  records.balance(user,balance);
  records.entry(user,request,delta,balance,reason,actor,null);
  return state(user);
 }
 private void lock(long user) {
  if(records.lockUser(user)==null) throw MockInput.error("mock_user_unavailable","用户不存在或已停用。");
  records.ensure(user);
 }
}
