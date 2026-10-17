package com.interview.copilot.common.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.service.mockinterview.MockConfigService;
import com.interview.copilot.service.mockinterview.MockInterviewService;
import com.interview.copilot.service.mockinterview.MockProviderService;
import com.interview.copilot.service.mockinterview.MockWalletService;
import com.interview.copilot.service.background.BackgroundService;
import com.interview.copilot.service.wallet.WalletService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.HttpMethod;
import java.util.UUID;
import java.time.Duration;

class MockInterviewIntegrationTest extends PaymentHttpFixture {
 @Autowired MockConfigService configs;
 @Autowired MockInterviewService interviews;
 @Autowired MockWalletService mockWallets;
 @Autowired WalletService assistWallets;
 @Autowired BackgroundService background;
 @Autowired ObjectMapper json;
 @MockitoBean MockProviderService provider;
 private UUID environment;
 @BeforeEach void prepareMock() {
  jdbc.update("UPDATE mock_interview_config SET version=0,payload=jsonb_set(payload,'{enabled}','false'::jsonb),tts_key=''");
  ObjectNode config=(ObjectNode)configs.get();config.put("enabled",true).put("llmModelId","fixture-llm").put("reportModelId","fixture-report").put("asrServiceId","fixture-asr");
  ((ObjectNode)config.path("tts")).put("endpoint","wss://example.com/tts").put("model","fixture-tts").put("voiceId","fixture-voice").put("apiKey","fixture-not-real-key");configs.save(3,config);
  environment=UUID.fromString(background.library(1).path("activeEnvironmentId").asText());
  String resume=UUID.randomUUID().toString();
  jdbc.update("INSERT INTO user_resumes(id,app_users_id,content,mutation_id) VALUES(?::uuid,1,?::jsonb,?::uuid)",resume,"{\"name\":\"测试简历\",\"text\":\"真实项目经历\"}",UUID.randomUUID().toString());
  jdbc.update("UPDATE interview_environments SET content=jsonb_set(content,'{resumeId}',to_jsonb(?::text)) WHERE id=?::uuid",resume,environment.toString());
  when(provider.completion(anyLong(),anyString(),anyString(),any(),anyInt())).thenAnswer(invocation->{
   String prompt=invocation.getArgument(2);
   if(prompt.contains("规划器"))return json.readTree("{\"topics\":[{\"id\":\"project\",\"objective\":\"项目实践\"},{\"id\":\"design\",\"objective\":\"方案设计\"}]}");
   return prompt.contains("复盘评审")?json.readTree("{\"summary\":\"依据实际回答复盘\",\"strengths\":[],\"improvements\":[],\"coverage\":[],\"nextPractice\":[]}"):json.createObjectNode().put("action","next_topic").put("speechText","请介绍你的项目及负责的部分。").put("topicId",UUID.randomUUID().toString());
  });
 }
 private ObjectNode createInput() {return json.createObjectNode().put("requestId",UUID.randomUUID().toString()).put("environmentId",environment.toString()).put("durationMinutes",15).put("difficulty","standard").put("avatarId","rewick-interviewer").put("voiceId","fixture-voice");}
 private void grant(long user,int seconds) {mockWallets.adjust(3,user,json.createObjectNode().put("requestId",UUID.randomUUID().toString()).put("deltaSeconds",seconds).put("reason","测试模拟额度"));}
 private JsonNode cmd(JsonNode session,String command) {
  ObjectNode input=json.createObjectNode().put("requestId",UUID.randomUUID().toString()).put("expectedVersion",session.path("version").asLong()).put("command",command);
  if(session.has("currentTurnId"))input.put("turnId",session.path("currentTurnId").asText());
  if("submit_answer".equals(command))input.put("text","我负责实现缓存并进行压测。");
  return interviews.command(1,UUID.fromString(session.path("id").asText()),input);
 }
 private JsonNode speaking(JsonNode session) throws InterruptedException {
  UUID id=UUID.fromString(session.path("id").asText());
  long deadline=System.nanoTime()+Duration.ofSeconds(5).toNanos();
  JsonNode value=session;
  while(System.nanoTime()<deadline) {value=interviews.get(1,id);if("speaking".equals(value.path("state").asText()))return value;Thread.sleep(10);}
  throw new AssertionError(value.toString());
 }
 @Test void independentBalance_mockDoesNotUseAssistCredits() {
  var session=interviews.create(1,createInput());
  assertThatThrownBy(()->cmd(session,"start")).isInstanceOf(ApiException.class).hasMessageContaining("模拟面试余额不足");
  grant(1,300);
  assertThat(assistWallets.state(1).availableSeconds()).isZero();
  assertThat(cmd(session,"start").path("state").asText()).isEqualTo("deciding");
 }
 @Test void commandLifecycle_answerPauseResumeFinishAndReport() throws InterruptedException {
  grant(1,300);
  JsonNode session=speaking(cmd(interviews.create(1,createInput()),"start"));
  session=cmd(session,"playback_completed");assertThat(session.path("state").asText()).isEqualTo("listening");
  session=speaking(cmd(session,"submit_answer"));assertThat(session.path("turns").size()).isEqualTo(2);
  session=cmd(session,"pause");assertThat(session.path("state").asText()).isEqualTo("paused");
  session=cmd(session,"resume");assertThat(session.path("state").asText()).isEqualTo("speaking");
  session=cmd(session,"finish");assertThat(session.path("state").asText()).isEqualTo("completed");
  interviews.expire();
  UUID id=UUID.fromString(session.path("id").asText());
  assertThat(jdbc.queryForObject("SELECT count(*) FROM mock_reports WHERE session_id=?",Integer.class,id)).isZero();
  assertThat(interviews.get(1,id).path("turns").get(0).path("answerText").asText()).isEqualTo("我负责实现缓存并进行压测。");
  org.mockito.Mockito.verify(provider,org.mockito.Mockito.never()).completion(anyLong(),org.mockito.ArgumentMatchers.eq("fixture-report"),anyString(),any(),anyInt());
 }
 @Test void idempotency_sameCreateAndCommandOnlyOnceDifferentPayloadRejected() {
  grant(1,100);var body=createInput();var first=interviews.create(1,body);assertThat(interviews.create(1,body)).isEqualTo(first);
  body.put("difficulty","deep");assertThatThrownBy(()->interviews.create(1,body)).isInstanceOf(ApiException.class);
  UUID id=UUID.fromString(first.path("id").asText());var command=json.createObjectNode().put("requestId",UUID.randomUUID().toString()).put("expectedVersion",0).put("command","start");
  JsonNode response=interviews.command(1,id,command);assertThat(interviews.command(1,id,command).path("version").asLong()).isEqualTo(response.path("version").asLong());
  command.put("command","finish");assertThatThrownBy(()->interviews.command(1,id,command)).isInstanceOf(ApiException.class);
 }
 @Test void settlement_usesLeaseCutoffAndDoesNotDoubleDebit() throws InterruptedException {
  grant(1,100);var session=speaking(cmd(interviews.create(1,createInput()),"start"));UUID id=UUID.fromString(session.path("id").asText());
  jdbc.update("UPDATE mock_usage_periods SET started_at=LOCALTIMESTAMP-INTERVAL '5 seconds',expires_at=LOCALTIMESTAMP+INTERVAL '25 seconds' WHERE app_users_id=1");
  session=cmd(interviews.get(1,id),"pause");long balance=mockWallets.state(1).path("availableSeconds").asLong();assertThat(balance).isBetween(94L,95L);
  interviews.get(1,id);interviews.get(1,id);assertThat(mockWallets.state(1).path("availableSeconds").asLong()).isEqualTo(balance);
  assertThat(assistWallets.state(1).availableSeconds()).isZero();
 }
 @Test void tenantIsolationAndAdminAuthorization_areEnforced() {
  var session=interviews.create(1,createInput());UUID id=UUID.fromString(session.path("id").asText());
  assertThatThrownBy(()->interviews.get(2,id)).isInstanceOf(ApiException.class);
  assertThat(call(HttpMethod.GET,"/admin/mock-interviews/settings",aliceToken,null).getStatusCode().value()).isEqualTo(403);
  assertThat(call(HttpMethod.POST,"/admin/users/1/mock-wallet/adjustments",aliceToken,json.createObjectNode()).getStatusCode().value()).isEqualTo(403);
 }
 @Test void secrets_maskAndRetainOnBlank_thenConflictOnStaleVersion() {
  var config=configs.get();assertThat(config.toString()).doesNotContain("fixture-not-real-key");assertThat(config.path("tts").path("hasApiKey").asBoolean()).isTrue();
  ((ObjectNode)config.path("tts")).put("apiKey","");configs.save(3,config);
  assertThat(configs.runtime().path("tts").path("apiKey").asText()).isEqualTo("fixture-not-real-key");
  assertThatThrownBy(()->configs.save(3,config)).isInstanceOf(ApiException.class);
 }
 @Test void heartbeatAndSpeechReservation_doNotInvalidateCommandVersion() throws InterruptedException {
  grant(1,100);var session=speaking(cmd(interviews.create(1,createInput()),"start"));UUID id=UUID.fromString(session.path("id").asText());
  assertThat(cmd(session,"heartbeat").path("version")).isEqualTo(session.path("version"));
  assertThat(interviews.reserveSpeech(1,id,session.path("generation").asInt(),20)).isTrue();assertThat(interviews.reserveSpeech(1,id,session.path("generation").asInt(),20)).isFalse();
 }
 @Test void crossMode_startAssistWhileMockActiveIsRejected() throws InterruptedException {
  grant(1,100);speaking(cmd(interviews.create(1,createInput()),"start"));assistWallets.state(1);jdbc.update("UPDATE time_wallets SET available_seconds=300 WHERE app_users_id=1");
  assertThatThrownBy(()->assistWallets.start(1,UUID.randomUUID().toString())).isInstanceOf(ApiException.class).hasMessageContaining("模拟面试");
 }
 @Test void changedConfig_neverCombinesNewKeyWithOldEndpoint() {
  var session=interviews.create(1,createInput());
  var config=(ObjectNode)configs.get();((ObjectNode)config.path("tts")).put("apiKey","new-fixture-key");configs.save(3,config);
  assertThatThrownBy(()->interviews.runtime(1,UUID.fromString(session.path("id").asText()))).isInstanceOf(ApiException.class).hasMessageContaining("配置已更新");
 }
 @Test void expiry_closesBillingAtLeaseWithoutChargingDisconnectedTime() throws InterruptedException {
  grant(1,100);var session=speaking(cmd(interviews.create(1,createInput()),"start"));
  jdbc.update("UPDATE mock_usage_periods SET started_at=LOCALTIMESTAMP-INTERVAL '40 seconds',expires_at=LOCALTIMESTAMP-INTERVAL '10 seconds' WHERE app_users_id=1");
  var state=interviews.get(1,UUID.fromString(session.path("id").asText()));assertThat(state.path("state").asText()).isEqualTo("paused");
  assertThat(state.path("usedSeconds").asLong()).isEqualTo(30);assertThat(mockWallets.state(1).path("availableSeconds").asLong()).isEqualTo(70);
 }
 @Test void adminAdjustment_settlesAccruedUsageBeforeRemovingRemainingBalance() throws InterruptedException {
  grant(1,100);speaking(cmd(interviews.create(1,createInput()),"start"));
  jdbc.update("UPDATE mock_usage_periods SET started_at=LOCALTIMESTAMP-INTERVAL '5 seconds',expires_at=LOCALTIMESTAMP+INTERVAL '25 seconds' WHERE app_users_id=1");
  mockWallets.adjust(3,1,json.createObjectNode().put("requestId",UUID.randomUUID().toString()).put("deltaSeconds",-90).put("reason","扣除剩余额度"));
  assertThat(jdbc.queryForObject("SELECT used_seconds FROM mock_interviews WHERE app_users_id=1",Long.class)).isBetween(5L,6L);
  assertThat(mockWallets.state(1).path("availableSeconds").asLong()).isBetween(4L,5L);
 }
 @Test void reportRetry_disabledDoesNotScheduleWorkAndEnforcesOwnership() {
  var session=cmd(interviews.create(1,createInput()),"finish");UUID id=UUID.fromString(session.path("id").asText());
  var result=interviews.retryReport(1,id,json.createObjectNode().put("requestId",UUID.randomUUID().toString()));
  assertThat(result.path("error").asText()).contains("AI复盘已停用");
  assertThat(jdbc.queryForObject("SELECT count(*) FROM mock_reports WHERE session_id=?",Integer.class,id)).isZero();
  assertThatThrownBy(()->interviews.report(2,id)).isInstanceOf(ApiException.class);
 }
 @Test void capacity_isSharedAcrossDifferentUsers() throws InterruptedException {
  grant(1,100);grant(2,100);
  var config=(ObjectNode)configs.get();config.put("maxConcurrent",1);configs.save(3,config);
  var alice=interviews.create(1,createInput());
  String secondEnv=background.library(2).path("activeEnvironmentId").asText();
  String resume=UUID.randomUUID().toString();jdbc.update("INSERT INTO user_resumes(id,app_users_id,content,mutation_id) VALUES(?::uuid,2,'{\"name\":\"简历\",\"text\":\"项目\"}'::jsonb,?::uuid)",resume,UUID.randomUUID().toString());
  jdbc.update("UPDATE interview_environments SET content=jsonb_set(content,'{resumeId}',to_jsonb(?::text)) WHERE id=?::uuid",resume,secondEnv);
  var body=createInput();body.put("environmentId",secondEnv);var bob=interviews.create(2,body);
  var gate=new java.util.concurrent.CountDownLatch(1);
  try(var pool=java.util.concurrent.Executors.newFixedThreadPool(2)) {
   var first=pool.submit(()->{gate.await();try{cmd(alice,"start");return true;}catch(ApiException error){return false;}});
   var second=pool.submit(()->{gate.await();try{interviews.command(2,UUID.fromString(bob.path("id").asText()),json.createObjectNode().put("requestId",UUID.randomUUID().toString()).put("expectedVersion",bob.path("version").asLong()).put("command","start"));return true;}catch(ApiException error){return false;}});
   gate.countDown();assertThat(java.util.List.of(first.get(),second.get())).containsExactlyInAnyOrder(true,false);
  } catch(java.util.concurrent.ExecutionException error) {throw new AssertionError(error);}
 }
 @Test void settingsTest_usesUnsavedDraftWithoutChangingPersistedConfig() {
  var draft=(ObjectNode)configs.get();((ObjectNode)draft.path("tts")).put("voiceId","draft-voice");
  // Validation happens before invoking the provider; unsupported sample rate must not mutate saved settings.
  ((ObjectNode)draft.path("tts")).put("sampleRate",16000);
  assertThatThrownBy(()->configs.test(draft)).isInstanceOf(ApiException.class);
  assertThat(configs.get().path("tts").path("voiceId").asText()).isEqualTo("fixture-voice");
 }
 @Test void pauseDuringDecision_resumeGeneratesNextTurnAndRejectsLateOldDecision() throws InterruptedException {
  grant(1,100);var first=speaking(cmd(interviews.create(1,createInput()),"start"));first=cmd(first,"playback_completed");
  var entered=new java.util.concurrent.CountDownLatch(1);var release=new java.util.concurrent.CountDownLatch(1);var calls=new java.util.concurrent.atomic.AtomicInteger();
  when(provider.completion(anyLong(),anyString(),anyString(),any(),anyInt())).thenAnswer(invocation->{
   int call=calls.incrementAndGet();if(call==1){entered.countDown();release.await(5,java.util.concurrent.TimeUnit.SECONDS);}
   return json.createObjectNode().put("action","next_topic").put("speechText",call==1?"迟到旧问题":"恢复后的新问题").put("topicId","topic-"+call);
  });
  var deciding=cmd(first,"submit_answer");assertThat(entered.await(3,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
  var resumed=cmd(cmd(deciding,"pause"),"resume");assertThat(resumed.path("state").asText()).isEqualTo("deciding");
  var next=speaking(resumed);release.countDown();assertThat(next.path("turns").size()).isEqualTo(2);assertThat(next.path("turns").get(1).path("question").asText()).isEqualTo("恢复后的新问题");
 }
 @Test void historicalPendingReports_expiryDoesNotInvokeTheModel() {
  var session=cmd(interviews.create(1,createInput()),"finish");UUID id=UUID.fromString(session.path("id").asText());
  jdbc.update("INSERT INTO mock_reports(session_id,status,attempts) VALUES(?,'pending',0)",id);
  org.mockito.Mockito.clearInvocations(provider);
  interviews.expire();
  org.mockito.Mockito.verifyNoInteractions(provider);
  assertThat(jdbc.queryForObject("SELECT attempts FROM mock_reports WHERE session_id=?",Integer.class,id)).isZero();
  assertThat(interviews.report(1,id).path("error").asText()).contains("AI复盘已停用");
 }
 @Test void settings_withoutReportModel_canStillEnableMockInterview() {
  var draft=(ObjectNode)configs.get();draft.put("reportModelId","");
  configs.save(3,draft);
  assertThat(configs.capabilities(1).path("enabled").asBoolean()).isTrue();
 }
}
