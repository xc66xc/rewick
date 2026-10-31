package com.interview.copilot.common.operations;

import com.github.dockerjava.api.command.InspectContainerResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.mapper.operations.OperationsMapper;
import com.interview.copilot.model.operations.OperationEvent;
import com.interview.copilot.model.operations.OperationsSettings;
import com.interview.copilot.service.operations.OperationsService;
import com.interview.copilot.validation.operations.OperationPolicyTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.annotation.DirtiesContext;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;
import org.testcontainers.utility.MountableFile;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

@Tag("integration") @Testcontainers
@DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
@org.springframework.test.context.bean.override.mockito.MockitoBean(types = com.interview.copilot.job.mockinterview.MockInterviewJob.class)
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
        "copilot.auth.bootstrap-username=","copilot.auth.bootstrap-password=",
        "copilot.auth.admin.bootstrap-username=","copilot.auth.admin.bootstrap-password="})
class OperationsIntegrationTest {
    @Container static final Database BUSINESS=new Database(false);
    @Container static final Database OPS=new Database(true);
    @DynamicPropertySource static void config(DynamicPropertyRegistry values) {
        values.add("spring.datasource.url",BUSINESS::getJdbcUrl);values.add("spring.datasource.username",BUSINESS::getUsername);values.add("spring.datasource.password",BUSINESS::getPassword);
        values.add("copilot.operations.storage.url",OPS::getJdbcUrl);values.add("copilot.operations.storage.username",OPS::getUsername);values.add("copilot.operations.storage.password",OPS::getPassword);
    }
    @Autowired OperationsService operations;
    @Autowired OperationsStore store;
    @Autowired OperationsCollector collector;
    @Autowired OperationsCache cache;
    @Autowired JdbcTemplate business;
    @Autowired ObjectMapper json;
    @Autowired com.interview.copilot.mapper.observability.OperationsBusinessMapper businessStats;
    @Autowired ApplicationContext context;
    @Autowired com.interview.copilot.service.auth.AuthService auth;
    @Autowired org.springframework.security.crypto.password.PasswordEncoder passwords;
    @Autowired TestRestTemplate http;
    private JdbcTemplate ops;
    @BeforeEach void reset() {
        ops=new JdbcTemplate(new DriverManagerDataSource(OPS.getJdbcUrl(),OPS.getUsername(),OPS.getPassword()));
        ops.execute("TRUNCATE operations_event_ids,operations_events,operations_histograms,operations_answers,operations_answer_totals,operations_audit");
        ops.update("UPDATE operations_settings SET version=0,payload='{\"enabled\":false,\"allowedUserIds\":[]}'::jsonb");
        cache.settings(OperationsSettings.disabled());collector.flush();
    }
    @Test void isolatedFactory_usesOnlyOpsDatabaseAndDoesNotBindOpsMapperToBusiness() {
        assertThat(context.getBeansOfType(OperationsMapper.class)).isEmpty();
        assertThat(business.queryForObject("SELECT to_regclass('operations_events')::text",String.class)).isNull();
        assertThat(ops.queryForObject("SELECT to_regclass('app_users')::text",String.class)).isNull();
        assertThat(http.getForEntity("/actuator/health",String.class).getStatusCode().value()).isEqualTo(200);
    }
    @Test void save_settings_versionsAuditsAndGrayPermissionAreDatabaseBacked() {
        var saved=operations.save(1,new OperationsSettings(0,true,List.of("12"),null));
        assertThat(saved.version()).isEqualTo(1);assertThat(operations.enabled(12)).isTrue();assertThat(operations.enabled(13)).isFalse();
        assertThat(ops.queryForObject("SELECT count(*) FROM operations_audit",Integer.class)).isEqualTo(1);
        assertThatThrownBy(() -> operations.save(1,new OperationsSettings(0,false,List.of(),null))).isInstanceOf(com.interview.copilot.exception.ApiException.class);
    }
    @Test void ingest_retryAndDelayedClientTerminal_updateHourlyCountsOnceAndFilterUser() throws Exception {
        operations.save(1,new OperationsSettings(0,true,List.of(),null));
        String operation=UUID.randomUUID().toString();
        OperationEvent server=event(operation,"llm.complete","backend","success",1000);
        collector.offer(12,server,true);collector.flush();
        OperationEvent desktop=event(operation,"answer.complete","desktop","cancelled",1100);
        var batch=json.createObjectNode();batch.putArray("events").add(json.valueToTree(desktop));
        operations.ingest(12,batch);operations.ingest(12,batch);collector.flush();
        assertThat(ops.queryForObject("SELECT count(*) FROM operations_events",Integer.class)).isEqualTo(2);
        assertThat(ops.queryForObject("SELECT sum(sample_count) FROM operations_answer_totals",Integer.class)).isEqualTo(1);
        assertThat(ops.queryForObject("SELECT sum(sample_count) FROM operations_answer_totals WHERE outcome='cancelled'",Integer.class)).isEqualTo(1);
        assertThat(((List<?>)operations.traces(24,12L,null,null,null,1,20).get("items"))).hasSize(1);
        assertThat(((List<?>)operations.traces(24,13L,null,null,null,1,20).get("items"))).isEmpty();
        assertThat(((List<?>)operations.detail(operation,12).get("events"))).hasSize(2);
    }
    @Test
    void traces_answerModelAndTerminalOutcome_ignoreRetrievalModelsAndLexicalOutcomeOrder() {
        String operation = UUID.randomUUID().toString();
        traceEvent(operation, "answer.prepare", "desktop", "success", null, "2.0.8", "session-a", 0);
        traceEvent(operation, "retrieval.embedding", "backend", "success", "qwen-embedding", null, null, 1);
        traceEvent(operation, "retrieval.web", "backend", "success", "z-search", null, null, 2);
        traceEvent(operation, "llm.first_content", "backend", "success", "first-model", null, null, 3);
        traceEvent(operation, "llm.complete", "backend", "success", "deepseek-flash", null, null, 4);
        traceEvent(operation, "llm.complete", "desktop", "success", "desktop-alias", "2.0.8", "session-a", 5);
        traceEvent(operation, "answer.complete", "desktop", "error", null, "2.0.8", "session-a", 6);
        // Each dimension may be on a different stage: filtering must select the whole operation.
        var result = operations.traces(24, 12L, "session-a", "deepseek-flash", "2.0.8", 1, 20);
        var trace = traceItem(result);

        assertThat(result.get("total")).isEqualTo(1L);
        assertThat(trace.get("model")).isEqualTo("deepseek-flash");
        assertThat(trace.get("operationType")).isEqualTo("answer");
        assertThat(trace.get("outcome")).isEqualTo("error");
        assertThat(trace.get("eventCount")).isEqualTo(7);
        var embeddingFilter = operations.traces(24, 12L, null, "qwen-embedding", null, 1, 20);
        assertThat(embeddingFilter.get("total")).isEqualTo(1L);
        assertThat(traceItem(embeddingFilter).get("eventCount")).isEqualTo(7);
        assertThat(traceItem(embeddingFilter).get("model")).isEqualTo("deepseek-flash");
        assertThat(operations.traces(24, 13L, null, null, null, 1, 20).get("total")).isEqualTo(0L);
        assertThat(operations.traces(24, 12L, "missing", null, null, 1, 20).get("total")).isEqualTo(0L);
    }

    @Test
    void traces_syncWithoutModel_preservesRealFailureAndClassifiesNonAnswerOperation() {
        String operation = UUID.randomUUID().toString();
        traceEvent(operation, "session.save", "desktop", "success", null, "2.0.8", "session-a", 0);
        traceEvent(operation, "session.sync", "desktop", "error", null, "2.0.8", "session-a", 1);
        var trace = traceItem(operations.traces(24, 12L, null, null, null, 1, 20));

        assertThat(trace.get("model")).isNull();
        assertThat(trace.get("operationType")).isEqualTo("session-sync");
        assertThat(trace.get("outcome")).isEqualTo("error");
        assertThat(trace.get("appVersion")).isEqualTo("2.0.8");
        assertThat(trace.get("eventCount")).isEqualTo(2);
    }

    @Test
    void traces_appVersion_usesLatestClientVersionInsteadOfLexicalMaximum() {
        String operation = UUID.randomUUID().toString();
        traceEvent(operation, "session.sync", "desktop", "error", null, "2.0.9", "session-a", 0);
        traceEvent(operation, "session.sync", "desktop", "success", null, "2.0.10", "session-a", 1);
        traceEvent(operation, "session.sync", "backend", "success", null, "9.0.0", "session-a", 2);
        var trace = traceItem(operations.traces(24, 12L, null, null, "2.0.9", 1, 20));

        assertThat(trace.get("appVersion")).isEqualTo("2.0.10");
        assertThat(trace.get("eventCount")).isEqualTo(3);
        assertThat(trace.get("outcome")).isEqualTo("success");
    }

    @Test
    void traces_terminalPriorityAndLatestRetry_doNotUseAlphabeticOutcomeMaximum() {
        String operation = UUID.randomUUID().toString();
        traceEvent(operation, "answer.prepare", "desktop", "success", null, null, null, 0);
        traceEvent(operation, "llm.complete", "backend", "error", "deepseek-flash", null, null, 1);
        traceEvent(operation, "answer.complete", "desktop", "success", null, null, null, 2);
        traceEvent(operation, "answer.complete", "desktop", "cancelled", null, null, null, 3);

        assertThat(traceItem(operations.traces(24, 12L, null, null, null, 1, 20)).get("outcome"))
                .isEqualTo("cancelled");
    }

    @Test
    void traces_asrAndUnfinishedAnswer_useRelevantModelAndFailureFallback() {
        String asr = UUID.randomUUID().toString();
        traceEvent(asr, "asr.connect", "backend", "success", "asr-service", null, "asr-session", 0);
        traceEvent(asr, "asr.complete", "backend", "timeout", "asr-service", null, "asr-session", 1);
        var trace = traceItem(operations.traces(24, 12L, "asr-session", null, null, 1, 20));
        assertThat(trace.get("operationType")).isEqualTo("asr");
        assertThat(trace.get("model")).isEqualTo("asr-service");
        assertThat(trace.get("outcome")).isEqualTo("timeout");

        String unfinished = UUID.randomUUID().toString();
        traceEvent(unfinished, "answer.prepare", "desktop", "success", null, null, "unfinished", 0);
        traceEvent(unfinished, "retrieval.embedding", "backend", "error", "embedding-only", null, "unfinished", 1);
        trace = traceItem(operations.traces(24, 12L, "unfinished", null, null, 1, 20));
        assertThat(trace.get("operationType")).isEqualTo("answer");
        assertThat(trace.get("model")).isNull();
        assertThat(trace.get("outcome")).isEqualTo("error");
        traceEvent(unfinished, "asr.complete", "backend", "success", "asr-service", null, "unfinished", 2);
        trace = traceItem(operations.traces(24, 12L, "unfinished", null, null, 1, 20));
        assertThat(trace.get("operationType")).isEqualTo("answer");
        assertThat(trace.get("model")).isNull();
        assertThat(trace.get("outcome")).isEqualTo("error");
    }

    @Test
    void traces_representativeBoundQueries_executeAndExplainOnPostgres() throws Exception {
        for (int index = 0; index < 40; index++) {
            String operation = UUID.randomUUID().toString();
            traceEvent(operation, "answer.prepare", "desktop", "success", null, "2.0.8", "fixture", 0);
            traceEvent(operation, "retrieval.embedding", "backend", "success", "embedding", null, null, 1);
            traceEvent(operation, "llm.complete", "backend", "success", "deepseek-flash", null, null, 2);
            traceEvent(operation, "answer.complete", "desktop", "success", null, "2.0.8", "fixture", 3);
        }
        ops.execute("ANALYZE operations_events");
        var configuration = new com.baomidou.mybatisplus.core.MybatisConfiguration();
        configuration.addMapper(OperationsMapper.class);
        var evidence = new StringBuilder("PostgreSQL: ")
                .append(ops.queryForObject("SELECT version()", String.class)).append("\nSynthetic fixture: 40 operations, 160 events. No load test.\n");
        for (boolean filtered : List.of(false, true)) {
            var parameters = new java.util.HashMap<String, Object>();
            parameters.put("hours", filtered ? 168 : 24);
            parameters.put("userId", filtered ? 12L : null);
            parameters.put("sessionId", filtered ? "fixture" : null);
            parameters.put("model", filtered ? "deepseek-flash" : null);
            parameters.put("appVersion", filtered ? "2.0.8" : null);
            parameters.put("size", 20);
            parameters.put("offset", 0);
            for (String statement : List.of("traces", "traceCount")) {
                var bound = configuration.getMappedStatement(OperationsMapper.class.getName() + "." + statement)
                        .getBoundSql(parameters);
                Object[] arguments = bound.getParameterMappings().stream()
                        .map(mapping -> parameters.get(mapping.getProperty())).toArray();
                String plan = ops.queryForObject("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + bound.getSql(),
                        String.class, arguments);
                assertThat(json.readTree(plan).get(0).has("Execution Time")).isTrue();
                evidence.append("\n").append(statement).append(" parameters=").append(parameters)
                        .append("\n").append(bound.getSql()).append("\n").append(plan).append("\n");
            }
            var result = operations.traces(filtered ? 168 : 24, filtered ? 12L : null,
                    filtered ? "fixture" : null, filtered ? "deepseek-flash" : null,
                    filtered ? "2.0.8" : null, 1, 20);
            assertThat(result.get("total")).isEqualTo(40L);
            assertThat((List<?>) result.get("items")).hasSize(20);
        }
        String output = System.getProperty("copilot.operations.explain.output");
        if (output != null) {
            Path file = Path.of(output);
            java.nio.file.Files.createDirectories(file.getParent());
            java.nio.file.Files.writeString(file, evidence);
        }
    }

    private Map<?, ?> traceItem(Map<String, Object> result) {
        var items = (List<?>) result.get("items");
        assertThat(items).hasSize(1);
        return (Map<?, ?>) items.getFirst();
    }

    private void traceEvent(String operation, String stage, String source, String outcome,
            String model, String version, String session, int offsetSeconds) {
        ops.update("""
                INSERT INTO operations_events(event_id,operation_id,user_id,stage,source,provider_type,
                    outcome,duration_ms,model,app_version,session_id,started_at,payload,server_only,token_sample)
                VALUES(CAST(? AS uuid),CAST(? AS uuid),12,?,?,'system',?,1,?,?,?,
                    LOCALTIMESTAMP - INTERVAL '1 minute' + make_interval(secs => ?),'{}'::jsonb,FALSE,FALSE)
                """, UUID.randomUUID().toString(), operation, stage, source, outcome, model, version, session, offsetSeconds);
    }

    @Test void batch_sharedHistogramBucket_correctlyAggregatesAndExactQuantileIsNotAveraged() {
        operations.save(1,new OperationsSettings(0,true,List.of(),null));
        for(int i=0;i<30;i++) collector.offer(12,event(UUID.randomUUID().toString(),"llm.first_content","desktop","success",i<20?100:10000),false);
        collector.flush();
        assertThat(ops.queryForObject("SELECT sum(sample_count) FROM operations_histograms",Integer.class)).isEqualTo(30);
        var stages=(List<?>)operations.performance(24).get("stages");
        assertThat(stages).hasSize(1);
        var first=(Map<?,?>)stages.getFirst();assertThat(((Number)first.get("p95Ms")).doubleValue()).isEqualTo(10000);
        assertThat(first.get("p99Ms")).isNull();
        assertThat(ops.queryForObject("SELECT count(*) FROM information_schema.columns WHERE table_name='operations_histograms' AND column_name IN ('user_id','operation_id','model','app_version')",Integer.class)).isZero();
    }
    @Test void businessMetrics_beijingTodayAndConsumedLedger_excludeAdminAndAdjustments() throws Exception {
        business.execute("TRUNCATE app_users RESTART IDENTITY CASCADE");
        long user=business.queryForObject("INSERT INTO app_users(display_name,password_hash,role) VALUES('ops-user','unused','USER') RETURNING id",Long.class);
        long admin=business.queryForObject("INSERT INTO app_users(display_name,password_hash,role) VALUES('ops-admin','unused','ADMIN') RETURNING id",Long.class);
        business.update("INSERT INTO interview_sessions(session_id,app_users_id,request_id,status,started_at,expires_at,used_seconds) VALUES(?,?,?,'ended',date_trunc('day',LOCALTIMESTAMP)-INTERVAL '1 second',LOCALTIMESTAMP,999)",UUID.randomUUID().toString(),user,UUID.randomUUID().toString());
        business.update("INSERT INTO interview_sessions(session_id,app_users_id,request_id,status,started_at,expires_at,used_seconds) VALUES(?,?,?,'ended',date_trunc('day',LOCALTIMESTAMP)+INTERVAL '1 second',LOCALTIMESTAMP,999)",UUID.randomUUID().toString(),admin,UUID.randomUUID().toString());
        business.update("INSERT INTO time_wallet_transactions(app_users_id,operation,delta_seconds,before_seconds,after_seconds,reason) VALUES(?,'consume',-40,100,60,'fixture'),(?,'adjust',-10,60,50,'fixture'),(?,'consume',-200,300,100,'fixture')",user,user,admin);
        var result=json.readTree(businessStats.summary(24));
        assertThat(result.path("activeUsers").asLong()).isZero();
        assertThat(result.path("usedSeconds").asLong()).isEqualTo(40);
        assertThat(result.path("activeUsersPeriod").asText()).isEqualTo("beijing_today");
        business.update("INSERT INTO interview_sessions(session_id,app_users_id,request_id,status,started_at,expires_at,used_seconds) VALUES(?,?,?,'ended',date_trunc('day',LOCALTIMESTAMP)+INTERVAL '1 second',LOCALTIMESTAMP,999)",UUID.randomUUID().toString(),user,UUID.randomUUID().toString());
        assertThat(json.readTree(businessStats.summary(2160)).path("activeUsers").asLong()).isEqualTo(1);
    }

    @Test void http_authValidationAndPayloadBoundaries_areSafeAndUseActualLoginIdentity() throws Exception {
        String token=login("USER","desktop");
        var headers=new org.springframework.http.HttpHeaders();headers.setBearerAuth(token);
        assertThat(http.exchange("/api/v1/admin/operations/health",org.springframework.http.HttpMethod.GET,new org.springframework.http.HttpEntity<>(headers),String.class).getStatusCode().value()).isEqualTo(403);
        var body=json.createObjectNode();var event=json.valueToTree(OperationPolicyTest.event(UUID.randomUUID().toString(),Map.of()));
        ((com.fasterxml.jackson.databind.node.ObjectNode)event).putNull("stage");body.putArray("events").add(event);
        assertThat(http.postForEntity("/api/v1/telemetry/operations",new org.springframework.http.HttpEntity<>(body,headers),String.class).getStatusCode().value()).isEqualTo(400);
        headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
        assertThat(http.postForEntity("/api/v1/telemetry/operations",new org.springframework.http.HttpEntity<>("{\"events\":[],\"padding\":\""+"x".repeat(300000)+"\"}",headers),String.class).getStatusCode().value()).isEqualTo(413);
        String admin=login("ADMIN","admin");headers.setBearerAuth(admin);
        var invalid=json.createObjectNode().put("version",0).put("enabled",true);invalid.putNull("allowedUserIds");invalid.putObject("thresholds");
        assertThat(http.exchange("/api/v1/admin/operations/settings",org.springframework.http.HttpMethod.PUT,new org.springframework.http.HttpEntity<>(invalid,headers),String.class).getStatusCode().value()).isEqualTo(400);
        assertThat(http.getForEntity("/actuator/prometheus",String.class).getStatusCode().value()).isEqualTo(403);
    }
    @Test void retention_dropOldPartition_releasesPhysicalSpaceAndKeepsRecentData() {
        String name="operations_events_d"+java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).minusDays(9).format(java.time.format.DateTimeFormatter.BASIC_ISO_DATE);
        ops.execute("CREATE TABLE "+name+" PARTITION OF operations_events FOR VALUES FROM (CURRENT_DATE-9) TO (CURRENT_DATE-8)");
        ops.execute("INSERT INTO operations_events(event_id,operation_id,user_id,stage,source,provider_type,outcome,duration_ms,started_at,payload,server_only,token_sample) SELECT gen_random_uuid(),gen_random_uuid(),1,'session.save','desktop','system','success',1,CURRENT_DATE-9,jsonb_build_object('fragmentCount',g),FALSE,FALSE FROM generate_series(1,20000) g");
        long before=ops.queryForObject("SELECT pg_database_size(current_database())",Long.class);
        collector.offer(12,event(UUID.randomUUID().toString(),"llm.complete","backend","success",10),true);collector.flush();
        store.query(mapper -> mapper.maintain(0));
        long after=ops.queryForObject("SELECT pg_database_size(current_database())",Long.class);
        assertThat(after).isLessThan(before);
        assertThat(ops.queryForObject("SELECT to_regclass(?)::text",String.class,name)).isNull();
        assertThat(ops.queryForObject("SELECT count(*) FROM operations_events",Integer.class)).isEqualTo(1);
    }
    @Test void overview_ratesUseCanonicalAttemptsAndActualUsageSameSource() {
        operations.save(1,new OperationsSettings(0,true,List.of(),null));
        String operation=UUID.randomUUID().toString();
        collector.offer(12,event(operation,"llm.complete","backend","error",100),true);
        collector.offer(12,event(operation,"answer.complete","desktop","error",120),false);
        var token=event(UUID.randomUUID().toString(),"llm.complete","backend","success",100);
        collector.offer(12,new OperationEvent(token.eventId(),token.operationId(),token.spanId(),null,null,null,token.stage(),token.source(),token.startedAt(),null,100,"success",null,"platform","llm",null,null,Map.of("totalTokens",10)),true);
        collector.flush();
        var summary=(Map<?,?>)operations.overview(24).get("performance");
        assertThat(((Number)summary.get("answers")).longValue()).isEqualTo(2);
        assertThat(((Number)summary.get("errorRate")).doubleValue()).isEqualTo(.5);
        assertThat(((Number)summary.get("tokenCoverage")).doubleValue()).isEqualTo(.5);
        assertThat(summary.get("tokenSource")).isEqualTo("backend");
        assertThat(summary.get("degradedRate")).isNull();
    }

    @Test void storage_retryEventIdWithChangedTimestamp_isGloballyDeduplicated() {
        var first=event(UUID.randomUUID().toString(),"llm.complete","backend","success",10);
        collector.offer(12,first,true);collector.flush();
        var changed=new OperationEvent(first.eventId(),first.operationId(),first.spanId(),null,null,null,
                first.stage(),first.source(),java.time.OffsetDateTime.parse(first.startedAt()).minusSeconds(10).toString(),null,20,"success",null,"platform","llm",null,null,Map.of());
        var row=new com.interview.copilot.entity.operations.OperationsEventRow(changed.eventId(),changed.operationId(),12,changed.stage(),changed.source(),"llm","success",20,null,null,null,changed.startedAt(),cache.encode(changed),true,false);
        store.transaction(mapper -> mapper.insertBatch(List.of(row)));
        assertThat(ops.queryForObject("SELECT count(*) FROM operations_events",Integer.class)).isEqualTo(1);
        assertThat(ops.queryForObject("SELECT sum(sample_count) FROM operations_histograms",Integer.class)).isEqualTo(1);
    }

    private String login(String role,String type) {
        String name="ops-"+UUID.randomUUID().toString().substring(0,8);
        long id=business.queryForObject("INSERT INTO app_users(display_name,password_hash,role) VALUES(?,?,?) RETURNING id",Long.class,name,passwords.encode("fixture-only-password"),role);
        business.update("INSERT INTO auth_identities(app_users_id,identity_type,identifier,verified_at) VALUES(?,'account',?,LOCALTIMESTAMP)",id,name);
        return auth.login(name,"fixture-only-password",type).accessToken();
    }

    private OperationEvent event(String operation,String stage,String source,String outcome,double duration) {
        var value=OperationPolicyTest.event(UUID.randomUUID().toString(),Map.of());
        return new OperationEvent(value.eventId(),operation,value.spanId(),null,null,null,stage,source,value.startedAt(),null,duration,outcome,null,"platform",stage.startsWith("answer")?"system":"llm",null,null,Map.of());
    }
    private static final class Database extends PostgreSQLContainer<Database> {
        private final boolean ops;
        Database(boolean ops) {
            super(DockerImageName.parse("interview-copilot-postgres:15.19-pgvector0.8.6").asCompatibleSubstituteFor("postgres"));
            this.ops=ops;withDatabaseName(ops?"copilot_operations":"copilot_business");
            withCopyFileToContainer(MountableFile.forHostPath(Path.of("sql")),"/tmp/sql");
        }
        @Override protected void containerIsStarted(InspectContainerResponse info) {
            super.containerIsStarted(info);
            try {
                var command=new ArrayList<String>(List.of("psql","-X","-v","ON_ERROR_STOP=1","-U",getUsername(),"-d",getDatabaseName()));
                if(ops) {command.add("-f");command.add("/tmp/sql/operations/01_operations.sql");}
                else {
                    try(var paths=java.nio.file.Files.list(Path.of("sql"))) {
                        paths.filter(path -> path.getFileName().toString().matches("[0-9]{2}_.*\\.sql"))
                                .sorted().forEach(path -> {command.add("-f");command.add("/tmp/sql/"+path.getFileName());});
                    }
                }
                var result=execInContainer(command.toArray(String[]::new));
                if(result.getExitCode()!=0) throw new IllegalStateException("Fixture SQL failed: "+result.getStderr());
            } catch(java.io.IOException error) {throw new IllegalStateException(error);}
            catch(InterruptedException error) {Thread.currentThread().interrupt();throw new IllegalStateException(error);}
        }
    }
}
