package com.interview.copilot.service.impl.mockinterview;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.entity.mockinterview.MockSessionEntity;
import com.interview.copilot.mapper.mockinterview.MockInterviewMapper;
import com.interview.copilot.model.background.BackgroundKind;
import com.interview.copilot.converter.background.BackgroundSnapshotConverter;
import com.interview.copilot.service.background.BackgroundService;
import com.interview.copilot.service.mockinterview.MockConfigService;
import com.interview.copilot.service.mockinterview.MockInterviewService;
import com.interview.copilot.service.mockinterview.MockMeterService;
import com.interview.copilot.service.mockinterview.MockOrchestrationService;
import com.interview.copilot.util.MockJson;
import com.interview.copilot.util.ServerTime;
import com.interview.copilot.validation.mockinterview.MockInput;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Duration;
import java.util.Set;
import java.util.UUID;

@Service
public class MockInterviewServiceImpl implements MockInterviewService {
 private static final Set<String> ACTIVE=Set.of("starting","speaking","listening","deciding");
 private final MockInterviewMapper records;
 private final MockMeterService meter;
 private final MockConfigService configs;
 private final BackgroundService background;
 private final ObjectMapper json;
 private final TransactionTemplate tx;
 private final MockOrchestrationService orchestration;
 private final java.util.concurrent.ConcurrentHashMap<Long,Boolean> preparing=new java.util.concurrent.ConcurrentHashMap<>();
 public MockInterviewServiceImpl(MockInterviewMapper records,MockMeterService meter,MockConfigService configs,BackgroundService background,ObjectMapper json,TransactionTemplate tx,MockOrchestrationService orchestration) {
  this.records=records;this.meter=meter;this.configs=configs;this.background=background;this.json=json;this.tx=tx;this.orchestration=orchestration;
 }
 public JsonNode create(long user,JsonNode input) {
  if(preparing.putIfAbsent(user,true)!=null)throw MockInput.error("mock_busy","面试提纲正在准备中，请稍后重试。");
  try{return prepare(user,input);}finally{preparing.remove(user);}
 }
 private JsonNode prepare(long user,JsonNode input) {
  String request=MockInput.uuid(input,"requestId"),environment=MockInput.uuid(input,"environmentId");
  int duration=MockInput.range(input,"durationMinutes",15,45);
  if(!Set.of(15,30,45).contains(duration) || !Set.of("standard","deep").contains(input.path("difficulty").asText()) || !"rewick-interviewer".equals(input.path("avatarId").asText())) throw MockInput.error("mock_invalid_input","面试时长、难度或形象无效。");
  requireEnabled(user);
  JsonNode config=configs.get();
  if(!config.path("tts").path("voiceId").asText().equals(input.path("voiceId").asText())) throw MockInput.error("mock_invalid_input","请选择平台可用音色。");
  var previous=records.request(user,request);
  if(previous!=null) {require(user,previous.id());if(!previous.requestHash().equals(MockJson.hash(input))) throw MockInput.error("mock_idempotency_conflict","重复请求内容不同。");return view(previous);}
  if(records.daily(user)>=config.path("dailySessionLimit").asInt()) throw MockInput.error("mock_daily_limit","今日模拟面试次数已达上限。");
  JsonNode env=background.detail(user,BackgroundKind.environments,environment);
  String resumeId=env.path("resumeId").asText("");
  if(resumeId.isBlank()) throw MockInput.error("mock_invalid_environment","请先在环境中选择简历。");
  JsonNode resume=background.detail(user,BackgroundKind.resumes,resumeId);
  JsonNode target=env.path("targetId").asText("").isBlank()?null:background.detail(user,BackgroundKind.targets,env.path("targetId").asText());
  ObjectNode snapshot=BackgroundSnapshotConverter.snapshot(json,env,resume,target);
  snapshot.put("difficulty",input.path("difficulty").asText()).put("avatarId","rewick-interviewer").put("voiceId",input.path("voiceId").asText()).put("durationMinutes",duration);
  snapshot.set("plan",orchestration.plan(user,snapshot,config));
  return tx.execute(status->{
   meter.lock(user);
   var prior=records.request(user,request);
   if(prior!=null) {require(user,prior.id());if(!prior.requestHash().equals(MockJson.hash(input))) throw MockInput.error("mock_idempotency_conflict","重复请求内容不同。");return view(prior);}
   if(records.daily(user)>=config.path("dailySessionLimit").asInt()) throw MockInput.error("mock_daily_limit","今日模拟面试次数已达上限。");
   String id=UUID.randomUUID().toString();
   records.create(user,id,request,MockJson.hash(input),environment,snapshot.toString(),config.toString(),duration);
   return view(records.get(user,id));
  });
 }
 public JsonNode list(long user) {var result=json.createObjectNode();var items=result.putArray("items");records.list(user).forEach(row->items.add(view(row,false)));return result;}
 public JsonNode get(long user,UUID id) {var result=tx.execute(status->{meter.lock(user);meter.settle(user,id.toString());return view(require(user,id.toString()));});if(!ACTIVE.contains(result.path("state").asText()))orchestration.cancel(id.toString());return result;}
 public JsonNode command(long user,UUID id,JsonNode input) {
  String request=MockInput.uuid(input,"requestId");
  String name=input.path("command").asText();
  if(!input.path("expectedVersion").isIntegralNumber())throw MockInput.error("mock_invalid_input","会话版本必须是整数。");
  JsonNode result=tx.execute(status->{
   meter.lock(user);
   var row=require(user,id.toString());
   if("heartbeat".equals(name)) {requireEnabled(user);meter.heartbeat(user,row.id());return view(require(user,row.id()));}
   var previous=records.command(user,row.id(),request);
   if(previous!=null) {if(!previous.payloadHash().equals(MockJson.hash(input))) throw MockInput.error("mock_idempotency_conflict","相同请求不能执行不同操作。");return MockJson.parse(json,previous.result());}
   meter.settle(user,row.id());row=require(user,row.id());
   if(row.version()!=input.path("expectedVersion").asLong(-1)) throw MockInput.error("mock_version_conflict","会话状态已更新，请刷新后重试。");
   apply(user,row,name,input);
   JsonNode response=view(require(user,row.id()));
   records.record(user,row.id(),request,MockJson.hash(input),response.toString());
   records.event(row.id(),response.path("version").asLong(),response.toString());
   return response;
  });
  if(Set.of("pause","finish","interrupt").contains(name))orchestration.cancel(id.toString());
  if("deciding".equals(result.path("state").asText())) orchestration.decide(user,id.toString(),result.path("generation").asInt());
  return result;
 }
 private void apply(long user,MockSessionEntity row,String command,JsonNode input) {
  switch(command) {
   case "start","resume" -> {
    requireEnabled(user);
    if(!("start".equals(command)?"ready":"paused").equals(row.state())) throw invalidState();
    if(MockJson.parse(json,row.config()).path("version").asLong()!=configs.get().path("version").asLong()) throw MockInput.error("mock_configuration_changed","平台模拟配置已更新，请重新创建面试。");
    records.lockCapacity();
    if(records.activeCount()>=configs.get().path("maxConcurrent").asInt()) throw MockInput.error("mock_busy","模拟面试并发已满，请稍后重试。");
    meter.start(user,row.id(),row.durationMinutes()*60L-row.usedSeconds());
    records.state(user,row.id(),hasPendingTurn(row)?"speaking":"deciding",1,null);
   }
   case "submit_answer","skip" -> {
    if(!"listening".equals(row.state())) throw invalidState();
    String turn=MockInput.uuid(input,"turnId");
    if(!turn.equals(row.currentTurnId())) throw invalidState();
    String text=input.path("text").asText().strip();
    if("submit_answer".equals(command) && (text.isBlank() || text.length()>12000)) throw MockInput.error("mock_invalid_input","回答不能为空或超过12000字符。");
    if(records.answer(row.id(),turn,text,"skip".equals(command)?"skipped":"answered")!=1) throw invalidState();
    records.state(user,row.id(),"deciding",1,null);
   }
   case "playback_completed" -> {
    if(!"speaking".equals(row.state()) || !row.currentTurnId().equals(input.path("turnId").asText())) throw invalidState();
    records.state(user,row.id(),"listening",0,null);
   }
   case "repeat" -> {if(!Set.of("speaking","listening").contains(row.state())) throw invalidState();records.state(user,row.id(),"speaking",1,null);}
   case "interrupt" -> {if(!"speaking".equals(row.state())) throw invalidState();records.state(user,row.id(),"listening",1,null);}
   case "pause" -> {if(!ACTIVE.contains(row.state())) throw invalidState();meter.stop(user,row.id());records.state(user,row.id(),"paused",1,null);}
   case "finish" -> {if("completed".equals(row.state())) return;meter.stop(user,row.id());records.state(user,row.id(),"completed",1,null);}
   default -> throw MockInput.error("mock_invalid_command","不支持的模拟面试操作。");
  }
 }
 public void pause(long user,UUID id,String reason) {
  tx.executeWithoutResult(status->{meter.lock(user);var row=require(user,id.toString());if(ACTIVE.contains(row.state())) {meter.stop(user,row.id());records.state(user,row.id(),"paused",1,reason);}});
  orchestration.cancel(id.toString());
 }
 public JsonNode runtime(long user,UUID id) {
  requireEnabled(user);
  var row=require(user,id.toString());
  var config=(ObjectNode)MockJson.parse(json,row.config());
  JsonNode live=configs.runtime();
  if(config.path("version").asLong()!=live.path("version").asLong()) throw MockInput.error("mock_configuration_changed","平台模拟配置已更新，请结束后重新创建面试。");
  ((ObjectNode)config.path("tts")).set("apiKey",live.path("tts").path("apiKey"));
  return config;
 }
 // Retain the old endpoints for installed clients without scheduling model work.
 public JsonNode report(long user,UUID id) {
  require(user,id.toString());
  return json.createObjectNode().put("status","failed").put("error","AI复盘已停用，请使用新版客户端导出问答Markdown。");
 }
 public JsonNode retryReport(long user,UUID id,JsonNode input) {
  MockInput.uuid(input,"requestId");
  return report(user,id);
 }
 public JsonNode remove(long user,UUID id) {
  tx.executeWithoutResult(status->{meter.lock(user);var row=require(user,id.toString());if(ACTIVE.contains(row.state())) throw MockInput.error("mock_busy","请先结束面试再删除。");records.delete(user,row.id());records.deleteTurns(row.id());records.scrubCommands(row.id());records.scrubEvents(row.id());records.reportSave(row.id(),"failed",null,"记录已删除。");});
  return json.createObjectNode().put("deleted",true);
 }
 public boolean reserveSpeech(long user,UUID id,int generation,int characters) {
  if(characters<1 || characters>2000) throw MockInput.error("mock_tts_budget","语音长度超出限制。");
  return tx.execute(status->{meter.lock(user);require(user,id.toString());return records.reserveSpeech(user,id.toString(),generation,characters)==1;});
 }
 public void expire() {
  for(var row:records.active()) {
   try {tx.executeWithoutResult(status->{meter.lock(row.userId());meter.settle(row.userId(),row.id());var current=require(row.userId(),row.id());if("paused".equals(current.state()) && Duration.between(current.updatedAt(),meter.now()).toMinutes()>=10) {records.state(row.userId(),row.id(),"completed",1,null);}});}
   catch(com.interview.copilot.exception.ApiException error) {org.slf4j.LoggerFactory.getLogger(getClass()).warn("Mock expiry rejected session={} code={}",row.id(),error.getMessage());}
  }
 }
 private boolean hasPendingTurn(MockSessionEntity row) {
  if(row.currentTurnId()==null)return false;
  for(String value:records.turns(row.id())) {JsonNode turn=MockJson.parse(json,value);if(row.currentTurnId().equals(turn.path("id").asText()))return "pending".equals(turn.path("status").asText());}
  return false;
 }
 private void requireEnabled(long user) {if(!configs.capabilities(user).path("enabled").asBoolean()) throw MockInput.error("mock_capability_unavailable","模拟面试尚未开放或授权已变更。");}
 private MockSessionEntity require(long user,String id) {var row=records.get(user,id);if(row==null) throw MockInput.error("mock_not_found","模拟面试不存在。");return row;}
 private com.interview.copilot.exception.ApiException invalidState() {return MockInput.error("mock_version_conflict","当前会话状态不允许此操作，请刷新后重试。");}
 private JsonNode view(MockSessionEntity row) {return view(row,true);}
 private JsonNode view(MockSessionEntity row,boolean includeTurns) {
  var snapshot=MockJson.parse(json,row.snapshot());var env=snapshot.path("interviewEnvironment");
  var result=json.createObjectNode().put("id",row.id()).put("state",row.state()).put("version",row.version()).put("generation",row.generation()).put("environmentName",env.path("name").asText()).put("interviewType",env.path("interviewType").asText("technical")).put("durationMinutes",row.durationMinutes()).put("usedSeconds",row.usedSeconds()).put("remainingSeconds",Math.max(0,row.durationMinutes()*60L-row.usedSeconds())).put("avatarId",snapshot.path("avatarId").asText()).put("voiceId",snapshot.path("voiceId").asText()).put("reportStatus","disabled").put("createdAt",ServerTime.instant(row.createdAt()).toString());
  result.put("pauseMs",MockJson.parse(json,row.config()).path("pauseMs").asInt(1800));
  if(row.currentTurnId()!=null) result.put("currentTurnId",row.currentTurnId());if(row.error()!=null) result.put("error",row.error());
  var turns=result.putArray("turns");if(includeTurns)records.turns(row.id()).forEach(text->turns.add(MockJson.parse(json,text)));return result;
 }
}
