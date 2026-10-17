package com.interview.copilot.service.impl.mockinterview;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.util.MockJson;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.mapper.mockinterview.MockConfigMapper;
import com.interview.copilot.security.platform.PlatformSecretCipher;
import com.interview.copilot.service.mockinterview.MockConfigService;
import com.interview.copilot.service.mockinterview.MockSpeechService;
import com.interview.copilot.validation.mockinterview.MockInput;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.net.URI;

@Service
public class MockConfigServiceImpl implements MockConfigService {
 private final MockConfigMapper records;
 private final ObjectMapper json;
 private final PlatformSecretCipher cipher;
 private final MockSpeechService speech;
 private final com.interview.copilot.service.audit.AuditService audit;
 public MockConfigServiceImpl(MockConfigMapper records,ObjectMapper json,PlatformSecretCipher cipher,MockSpeechService speech,com.interview.copilot.service.audit.AuditService audit) {
  this.records=records;this.json=json;this.cipher=cipher;this.speech=speech;this.audit=audit;
 }
 public JsonNode get() {return view(records.get());}
 private ObjectNode view(com.interview.copilot.entity.mockinterview.MockConfigEntity row) {
  var result=(ObjectNode)MockJson.parse(json,row.payload());
  result.put("version",row.version());
  ((ObjectNode)result.path("tts")).put("hasApiKey",!row.ttsKey().isBlank());
  return result;
 }
 public JsonNode runtime() {
  var row=records.get();
  var result=view(row);
  ((ObjectNode)result.path("tts")).put("apiKey",cipher.decrypt("mock-tts",row.ttsKey()));
  return result;
 }
 @Transactional
 public JsonNode save(long actor,JsonNode input) {
  validate(input);
  if(records.lockActor(actor)==null)throw MockInput.error("mock_user_unavailable","管理员不存在或权限已变更。");
  var row=records.get();
  var payload=(ObjectNode)input.deepCopy();
  payload.remove("version");
  var tts=(ObjectNode)payload.path("tts");
  String key=tts.path("apiKey").asText();
  tts.remove(java.util.List.of("apiKey","hasApiKey"));
  String encrypted=key.isBlank()?row.ttsKey():cipher.encrypt("mock-tts",key);
  if(payload.path("enabled").asBoolean() && encrypted.isBlank()) throw MockInput.error("mock_invalid_input","请配置语音合成 API Key。");
  if(records.save(input.path("version").asLong(-1),payload.toString(),encrypted)!=1) throw MockInput.error("mock_version_conflict","配置已被其他管理员修改，请刷新后重试。");
  audit.record(actor,"mock.settings.update","version:"+(row.version()+1));
  return get();
 }
 public JsonNode capabilities(long user) {
  JsonNode config=get();
  boolean allowed=config.path("allowedUserIds").isEmpty();
  for(JsonNode id:config.path("allowedUserIds")) if(id.asLong()==user) allowed=true;
  var result=json.createObjectNode().put("enabled",config.path("enabled").asBoolean()&&allowed);
  result.putArray("durations").add(15).add(30).add(45);
  result.putArray("avatars").addObject().put("id","rewick-interviewer").put("name","掌灯面试官");
  result.putArray("voices").addObject().put("id",config.path("tts").path("voiceId").asText()).put("name","平台面试官");
  return result;
 }
 public JsonNode test(JsonNode input) {
  validate(input);
  ObjectNode runtime=(ObjectNode)input.deepCopy();
  ObjectNode tts=(ObjectNode)runtime.path("tts");
  if(tts.path("apiKey").asText().isBlank()) tts.set("apiKey",runtime().path("tts").path("apiKey"));
  speech.stream(runtime,"你好，欢迎参加模拟面试。",runtime.path("tts").path("voiceId").asText(),audio->{},()->false);
  return json.createObjectNode().put("success",true).put("message","语音合成连接成功。");
 }
 private void validate(JsonNode input) {
  if(!input.isObject() || !input.path("enabled").isBoolean() || !input.path("tts").isObject() || !input.path("version").isIntegralNumber()) throw MockInput.error("mock_invalid_input","模拟配置格式无效。");
  java.util.Set<String> allowed=java.util.Set.of("version","enabled","allowedUserIds","llmModelId","reportModelId","asrServiceId","tts","maxConcurrent","maxFollowUps","pauseMs","maxTtsCharacters","maxOutputTokens","dailySessionLimit");
  input.fieldNames().forEachRemaining(field->{if(!allowed.contains(field))throw MockInput.error("mock_invalid_input","存在未知模拟配置字段。");});
  java.util.Set<String> ttsFields=java.util.Set.of("endpoint","model","apiKey","hasApiKey","voiceId","sampleRate");
  input.path("tts").fieldNames().forEachRemaining(field->{if(!ttsFields.contains(field))throw MockInput.error("mock_invalid_input","存在未知语音配置字段。");});
  for(String field:java.util.List.of("llmModelId","reportModelId","asrServiceId"))if(!input.path(field).isTextual() || input.path(field).asText().length()>200)throw MockInput.error("mock_invalid_input","服务标识格式无效。");
  for(String field:java.util.List.of("endpoint","model","voiceId","apiKey"))if(input.path("tts").path(field).asText().length()>4096)throw MockInput.error("mock_invalid_input","语音配置字段过长。");
  MockInput.range(input,"maxConcurrent",1,10);MockInput.range(input,"maxFollowUps",0,2);
  MockInput.range(input,"pauseMs",1000,5000);MockInput.range(input,"maxTtsCharacters",1000,50000);
  MockInput.range(input,"maxOutputTokens",128,4096);MockInput.range(input,"dailySessionLimit",1,100);
  if(!input.path("allowedUserIds").isArray() || input.path("allowedUserIds").size()>1000) throw MockInput.error("mock_invalid_input","灰度用户列表无效。");
  for(JsonNode user:input.path("allowedUserIds"))if(!user.isIntegralNumber() || user.asLong()<1)throw MockInput.error("mock_invalid_input","灰度用户ID必须为正整数。");
  if(!input.path("enabled").asBoolean()) return;
  for(String field:java.util.List.of("llmModelId","asrServiceId")) if(input.path(field).asText().isBlank()) throw MockInput.error("mock_invalid_input","请选择平台模型与转写服务。");
  JsonNode tts=input.path("tts");
  URI endpoint;
  try {endpoint=URI.create(tts.path("endpoint").asText());} catch(IllegalArgumentException error) {throw MockInput.error("mock_invalid_input","语音地址无效。");}
  if(!"wss".equals(endpoint.getScheme()) || endpoint.getHost()==null || endpoint.getUserInfo()!=null || endpoint.getRawQuery()!=null || endpoint.getPath().isBlank()) throw MockInput.error("mock_invalid_input","请填写完整 WSS 语音合成地址，不能包含凭据或查询参数。");
  if(tts.path("sampleRate").asInt()!=24000 || tts.path("model").asText().isBlank() || tts.path("voiceId").asText().isBlank()) throw MockInput.error("mock_invalid_input","语音模型、音色必填，采样率须为24000。");
 }
}
