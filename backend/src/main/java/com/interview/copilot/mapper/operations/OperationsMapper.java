package com.interview.copilot.mapper.operations;

import com.interview.copilot.entity.operations.OperationsEventRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Update;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Param;
import java.util.List;
import java.util.Map;

@Mapper
public interface OperationsMapper {
    @Select("SELECT version,payload::text AS payload FROM operations_settings WHERE id=1")
    Map<String,Object> settings();
    @Update("UPDATE operations_settings SET version=version+1,payload=CAST(#{payload} AS jsonb),updated_at=LOCALTIMESTAMP(6) WHERE id=1 AND version=#{version}")
    int settingsUpdate(@Param("version") long version, @Param("payload") String payload);
    @Insert("INSERT INTO operations_audit(actor_id,version) VALUES(#{actor},#{version})")
    void audit(@Param("actor") long actor, @Param("version") long version);
    @Insert("""
        <script>WITH incoming(event_id,operation_id,user_id,stage,source,provider_type,outcome,duration_ms,model,app_version,session_id,started_at,payload,server_only,token_sample) AS (
        VALUES <foreach collection="rows" item="row" separator=",">(CAST(#{row.eventId} AS uuid),CAST(#{row.operationId} AS uuid),#{row.userId},#{row.stage},#{row.source},#{row.providerType},#{row.outcome},#{row.durationMs},#{row.model},#{row.appVersion},#{row.sessionId},CAST(#{row.startedAt} AS timestamptz) AT TIME ZONE 'Asia/Shanghai',CAST(#{row.payload} AS jsonb),#{row.serverOnly},#{row.tokenSample})</foreach>), accepted AS (
        INSERT INTO operations_event_ids(event_id) SELECT DISTINCT event_id FROM incoming ON CONFLICT DO NOTHING RETURNING event_id
        ), inserted AS (
        INSERT INTO operations_events(event_id,operation_id,user_id,stage,source,provider_type,outcome,duration_ms,model,app_version,session_id,started_at,payload,server_only,token_sample)
        SELECT DISTINCT ON (incoming.event_id) incoming.* FROM incoming JOIN accepted ON accepted.event_id=incoming.event_id
        ON CONFLICT DO NOTHING RETURNING event_id,operation_id,stage,source,provider_type,outcome,duration_ms,model,app_version,started_at,server_only,token_sample)
        INSERT INTO operations_histograms(at,stage,source,provider_type,outcome,bucket_ms,sample_count,server_only_count,token_samples)
        SELECT date_trunc('hour',started_at),stage,source,provider_type,outcome,
        CASE WHEN duration_ms=0 THEN 0 ELSE least(86400000,power(2,ceil(ln(greatest(1,duration_ms))/ln(2)))) END AS bucket,
        count(*),sum(CASE WHEN server_only THEN 1 ELSE 0 END),sum(CASE WHEN token_sample THEN 1 ELSE 0 END) FROM inserted
        GROUP BY date_trunc('hour',started_at),stage,source,provider_type,outcome,bucket
        ON CONFLICT(at,stage,source,provider_type,outcome,bucket_ms) DO UPDATE
        SET sample_count=operations_histograms.sample_count+excluded.sample_count,
        server_only_count=operations_histograms.server_only_count+excluded.server_only_count,
        token_samples=operations_histograms.token_samples+excluded.token_samples
        </script>
        """)
    int insertBatch(@Param("rows") List<OperationsEventRow> rows);
    @Update("""
        WITH previous AS (SELECT at,outcome,priority FROM operations_answers
        WHERE operation_id=CAST(#{operationId} AS uuid) AND user_id=#{userId} FOR UPDATE),
        candidate AS (SELECT date_trunc('hour',CAST(#{startedAt} AS timestamptz) AT TIME ZONE 'Asia/Shanghai') AS at,
        #{outcome} AS outcome,CASE WHEN #{stage}='answer.complete' THEN 2 ELSE 1 END AS priority
        WHERE #{stage} IN ('answer.complete','llm.complete')
        AND EXISTS(SELECT 1 FROM operations_events WHERE event_id=CAST(#{eventId} AS uuid)
        AND operation_id=CAST(#{operationId} AS uuid) AND user_id=#{userId} AND stage=#{stage} AND outcome=#{outcome})
        AND NOT EXISTS(SELECT 1 FROM previous WHERE priority>=CASE WHEN #{stage}='answer.complete' THEN 2 ELSE 1 END)),
        changed AS (INSERT INTO operations_answers(operation_id,user_id,at,outcome,priority)
        SELECT CAST(#{operationId} AS uuid),#{userId},at,outcome,priority FROM candidate
        ON CONFLICT(operation_id,user_id) DO UPDATE SET outcome=excluded.outcome,priority=excluded.priority
        WHERE excluded.priority>operations_answers.priority RETURNING at,outcome),
        deltas AS (SELECT at,outcome,1::bigint AS delta FROM changed UNION ALL
        SELECT previous.at,previous.outcome,-1::bigint FROM previous WHERE EXISTS(SELECT 1 FROM changed)),
        grouped AS (SELECT at,outcome,sum(delta) AS delta FROM deltas GROUP BY at,outcome)
        INSERT INTO operations_answer_totals(at,outcome,sample_count) SELECT at,outcome,delta FROM grouped
        ON CONFLICT(at,outcome) DO UPDATE SET sample_count=operations_answer_totals.sample_count+excluded.sample_count
        """)
    void answer(OperationsEventRow row);
    @Delete("DELETE FROM operations_answers WHERE at<LOCALTIMESTAMP-INTERVAL '7 days'")
    void retainAnswers();
    @Delete("DELETE FROM operations_answer_totals WHERE at<LOCALTIMESTAMP-INTERVAL '90 days'")
    void retainAnswerTotals();
    @Select("""
        WITH totals AS (SELECT COALESCE(sum(sample_count),0) AS answers,
        COALESCE(sum(sample_count) FILTER(WHERE outcome='error'),0) AS errors,
        COALESCE(sum(sample_count) FILTER(WHERE outcome='timeout'),0) AS timeouts,
        COALESCE(sum(sample_count) FILTER(WHERE outcome='rejected'),0) AS rejections,
        COALESCE(sum(sample_count) FILTER(WHERE outcome='cancelled'),0) AS cancellations
        FROM operations_answer_totals WHERE at>=LOCALTIMESTAMP-make_interval(hours => #{hours})),
        counters AS (SELECT COALESCE(sum(sample_count) FILTER(WHERE stage IN ('retrieval.rag','retrieval.web') AND outcome='degraded'),0) AS degraded,
        COALESCE(sum(sample_count) FILTER(WHERE source='desktop'),0) AS client_reported,
        COALESCE(sum(server_only_count),0) AS server_only,COALESCE(sum(token_samples),0) AS token_samples
        FROM operations_histograms WHERE at>=LOCALTIMESTAMP-make_interval(hours => #{hours})),
        buckets AS (SELECT bucket_ms,sum(sample_count) AS count FROM operations_histograms
        WHERE at>=LOCALTIMESTAMP-make_interval(hours => #{hours}) AND stage='llm.first_content' AND outcome='success' AND source=(CASE WHEN EXISTS(SELECT 1 FROM operations_histograms WHERE stage='llm.first_content' AND source='desktop' AND outcome='success' AND at>=LOCALTIMESTAMP-make_interval(hours => #{hours})) THEN 'desktop' ELSE 'backend' END) GROUP BY bucket_ms),
        ranked AS (SELECT *,sum(count) OVER(ORDER BY bucket_ms) AS cumulative,sum(count) OVER() AS total FROM buckets)
        SELECT json_build_object('answers',answers,'errors',errors,'timeouts',timeouts,'rejections',rejections,'cancellations',cancellations,'degraded',degraded,
        'firstContentP95Ms',(SELECT min(bucket_ms) FILTER(WHERE cumulative>=total*.95) FROM ranked),
        'firstContentSource',(CASE WHEN EXISTS(SELECT 1 FROM operations_histograms WHERE stage='llm.first_content' AND source='desktop' AND outcome='success' AND at>=LOCALTIMESTAMP-make_interval(hours => #{hours})) THEN 'desktop' ELSE 'backend' END),'sampleCount',(SELECT COALESCE(max(total),0) FROM ranked),'clientReported',client_reported,
        'serverOnly',server_only,'tokenSamples',token_samples)::text FROM totals,counters
        """)
    String aggregateSummary(int hours);
    @Select("""
        WITH retrieval_source AS (SELECT stage,CASE WHEN sum(sample_count) FILTER(WHERE source='desktop')>0 THEN 'desktop' ELSE 'backend' END AS source
        FROM operations_histograms WHERE at>=LOCALTIMESTAMP-make_interval(hours => #{hours}) AND stage IN ('retrieval.rag','retrieval.web') GROUP BY stage),
        retrieval AS (SELECT COALESCE(sum(h.sample_count),0) AS requests,
        COALESCE(sum(h.sample_count) FILTER(WHERE h.outcome='degraded'),0) AS degraded,
        string_agg(DISTINCT h.source,',' ORDER BY h.source) AS source FROM operations_histograms h JOIN retrieval_source r ON r.stage=h.stage AND r.source=h.source
        WHERE h.at>=LOCALTIMESTAMP-make_interval(hours => #{hours})),
        llm_source AS (SELECT CASE WHEN sum(sample_count) FILTER(WHERE source='desktop')>0 THEN 'desktop' ELSE 'backend' END AS source
        FROM operations_histograms WHERE at>=LOCALTIMESTAMP-make_interval(hours => #{hours}) AND stage='llm.complete'),
        llm AS (SELECT COALESCE(sum(sample_count),0) AS samples,COALESCE(sum(token_samples),0) AS tokens
        FROM operations_histograms WHERE at>=LOCALTIMESTAMP-make_interval(hours => #{hours}) AND stage='llm.complete' AND source=(SELECT source FROM llm_source)),
        answers AS (SELECT COALESCE(sum(sample_count) FILTER(WHERE outcome NOT IN ('cancelled','skipped','rejected')),0) AS eligible,
        COALESCE(sum(sample_count) FILTER(WHERE outcome IN ('error','timeout')),0) AS errors
        FROM operations_answer_totals WHERE at>=LOCALTIMESTAMP-make_interval(hours => #{hours}))
        SELECT json_build_object('retrievalCount',requests,'retrievalSource',CASE WHEN source LIKE '%,%' THEN 'mixed' ELSE source END,
        'degraded',degraded,'degradedRate',degraded::double precision/nullif(requests,0),
        'errorRate',errors::double precision/nullif(eligible,0),'errorRateSamples',eligible,
        'errorRateDenominator','canonical_attempts_excluding_cancelled_skipped_rejected',
        'llmSamples',samples,'tokenSamples',tokens,'tokenCoverage',tokens::double precision/nullif(samples,0),
        'tokenSource',(SELECT source FROM llm_source))::text FROM retrieval,llm,answers
        """)
    String coverage(int hours);
    @Select("""
 SELECT pg_database_size(current_database()) AS bytes,
 (SELECT to_char(min(started_at),'YYYY-MM-DD"T"HH24:MI:SS.US')||'+08:00' FROM operations_events) AS "detailAvailableSince",
 (SELECT to_char(min(at),'YYYY-MM-DD"T"HH24:MI:SS.US')||'+08:00' FROM operations_histograms) AS "trendAvailableSince"
 """)
    Map<String,Object> storage();
    @Select("SELECT operations_partition_maintenance(#{budget})")
    int maintain(long budget);
    @Insert("INSERT INTO operations_snapshots(name,payload) VALUES(#{name},CAST(#{payload} AS jsonb)) ON CONFLICT(name) DO UPDATE SET payload=excluded.payload,updated_at=LOCALTIMESTAMP(6)")
    void snapshot(@Param("name") String name, @Param("payload") String payload);
    @Select("SELECT payload::text FROM operations_snapshots WHERE name=#{name}")
    String snapshotRead(String name);
    @Select("""
        SELECT json_build_object('answers',count(DISTINCT (user_id,operation_id)) FILTER(WHERE stage='llm.complete'),
        'errors',count(*) FILTER(WHERE stage='llm.complete' AND outcome='error'),
        'cancellations',count(*) FILTER(WHERE stage='llm.complete' AND outcome='cancelled'),
        'degraded',count(*) FILTER(WHERE stage IN ('retrieval.rag','retrieval.web') AND outcome='degraded'),
        'firstContentP95Ms',percentile_cont(.95) WITHIN GROUP(ORDER BY duration_ms) FILTER(WHERE stage='llm.first_content' AND outcome='success' AND source=(CASE WHEN EXISTS(SELECT 1 FROM operations_events WHERE stage='llm.first_content' AND source='desktop' AND outcome='success' AND started_at>=LOCALTIMESTAMP-make_interval(hours => #{hours})) THEN 'desktop' ELSE 'backend' END)),
        'firstContentSource',(CASE WHEN EXISTS(SELECT 1 FROM operations_events WHERE stage='llm.first_content' AND source='desktop' AND outcome='success' AND started_at>=LOCALTIMESTAMP-make_interval(hours => #{hours})) THEN 'desktop' ELSE 'backend' END),'sampleCount',count(*) FILTER(WHERE stage='llm.first_content' AND outcome='success' AND source=(CASE WHEN EXISTS(SELECT 1 FROM operations_events WHERE stage='llm.first_content' AND source='desktop' AND outcome='success' AND started_at>=LOCALTIMESTAMP-make_interval(hours => #{hours})) THEN 'desktop' ELSE 'backend' END)),
        'clientReported',count(*) FILTER(WHERE source='desktop'), 'serverOnly',count(*) FILTER(WHERE server_only),
        'tokenSamples',count(*) FILTER(WHERE token_sample))::text
        FROM operations_events WHERE started_at >= LOCALTIMESTAMP - make_interval(hours => #{hours})
        """)
    String performanceSummary(int hours);
    @Select("""
        SELECT json_build_object('stage',stage,'source',source,'count',count(*),
        'p50Ms',percentile_cont(.5) WITHIN GROUP(ORDER BY duration_ms),
        'p95Ms',percentile_cont(.95) WITHIN GROUP(ORDER BY duration_ms),
        'p99Ms',CASE WHEN count(*)>=100 THEN percentile_cont(.99) WITHIN GROUP(ORDER BY duration_ms) END)::text
        FROM operations_events WHERE started_at >= LOCALTIMESTAMP - make_interval(hours => #{hours})
        GROUP BY stage,source ORDER BY stage,source
        """)
    List<String> stages(int hours);
    @Select("""
        SELECT json_build_object('at',to_char(date_trunc('hour',started_at),'YYYY-MM-DD"T"HH24:MI:SS')||'+08:00',
        'source',(CASE WHEN EXISTS(SELECT 1 FROM operations_events WHERE stage='llm.first_content' AND source='desktop' AND outcome='success' AND started_at>=LOCALTIMESTAMP-make_interval(hours => #{hours})) THEN 'desktop' ELSE 'backend' END),'count',count(*),'p95Ms',percentile_cont(.95) WITHIN GROUP(ORDER BY duration_ms))::text
        FROM operations_events WHERE started_at >= LOCALTIMESTAMP - make_interval(hours => #{hours}) AND stage='llm.first_content' AND outcome='success' AND source=(CASE WHEN EXISTS(SELECT 1 FROM operations_events WHERE stage='llm.first_content' AND source='desktop' AND outcome='success' AND started_at>=LOCALTIMESTAMP-make_interval(hours => #{hours})) THEN 'desktop' ELSE 'backend' END)
        GROUP BY date_trunc('hour',started_at) ORDER BY date_trunc('hour',started_at)
        """)
    List<String> trend(int hours);
    @Select("""
        SELECT json_build_object('model',model,'appVersion',app_version,'source',(CASE WHEN EXISTS(SELECT 1 FROM operations_events WHERE stage='llm.first_content' AND source='desktop' AND outcome='success' AND started_at>=LOCALTIMESTAMP-make_interval(hours => #{hours})) THEN 'desktop' ELSE 'backend' END),'count',count(*),
        'p95Ms',percentile_cont(.95) WITHIN GROUP(ORDER BY duration_ms))::text FROM operations_events
        WHERE started_at >= LOCALTIMESTAMP - make_interval(hours => #{hours}) AND stage='llm.first_content' AND outcome='success' AND source=(CASE WHEN EXISTS(SELECT 1 FROM operations_events WHERE stage='llm.first_content' AND source='desktop' AND outcome='success' AND started_at>=LOCALTIMESTAMP-make_interval(hours => #{hours})) THEN 'desktop' ELSE 'backend' END)
        GROUP BY model,app_version ORDER BY count(*) DESC LIMIT 100
        """)
    List<String> comparisons(int hours);
    @Select("""
        WITH buckets AS (SELECT stage,source,bucket_ms,sum(sample_count) AS count FROM operations_histograms
        WHERE at >= LOCALTIMESTAMP - make_interval(hours => #{hours}) GROUP BY stage,source,bucket_ms),
        ranked AS (SELECT *,sum(count) OVER(PARTITION BY stage,source ORDER BY bucket_ms) AS cumulative,
        sum(count) OVER(PARTITION BY stage,source) AS total FROM buckets)
        SELECT json_build_object('stage',stage,'source',source,'count',max(total),
        'p50Ms',min(bucket_ms) FILTER(WHERE cumulative >= total*.5),
        'p95Ms',min(bucket_ms) FILTER(WHERE cumulative >= total*.95),
        'p99Ms',CASE WHEN max(total)>=100 THEN min(bucket_ms) FILTER(WHERE cumulative>=total*.99) END)::text
        FROM ranked GROUP BY stage,source ORDER BY stage,source
        """)
    List<String> histogramStages(int hours);
    @Select("""
        WITH buckets AS (SELECT at,bucket_ms,sum(sample_count) AS count FROM operations_histograms
        WHERE at >= LOCALTIMESTAMP - make_interval(hours => #{hours}) AND stage='llm.first_content'
        AND outcome='success' AND source=(CASE WHEN EXISTS(SELECT 1 FROM operations_histograms WHERE stage='llm.first_content' AND source='desktop' AND outcome='success' AND at>=LOCALTIMESTAMP-make_interval(hours => #{hours})) THEN 'desktop' ELSE 'backend' END) GROUP BY at,bucket_ms),
        ranked AS (SELECT *,sum(count) OVER(PARTITION BY at ORDER BY bucket_ms) AS cumulative,
        sum(count) OVER(PARTITION BY at) AS total FROM buckets)
        SELECT json_build_object('at',to_char(at,'YYYY-MM-DD"T"HH24:MI:SS')||'+08:00',
        'source',(CASE WHEN EXISTS(SELECT 1 FROM operations_histograms WHERE stage='llm.first_content' AND source='desktop' AND outcome='success' AND at>=LOCALTIMESTAMP-make_interval(hours => #{hours})) THEN 'desktop' ELSE 'backend' END),'count',max(total),'p95Ms',min(bucket_ms) FILTER(WHERE cumulative>=total*.95))::text
        FROM ranked GROUP BY at ORDER BY at
        """)
    List<String> histogramTrend(int hours);
    @Select("""
        SELECT json_build_object('samples',(SELECT count(*) FROM operations_answers WHERE at>=LOCALTIMESTAMP-INTERVAL '5 minutes' AND outcome NOT IN ('cancelled','skipped','rejected')),
        'errors',(SELECT count(*) FROM operations_answers WHERE at>=LOCALTIMESTAMP-INTERVAL '5 minutes' AND outcome IN ('error','timeout')),
        'retrievals',count(*) FILTER(WHERE stage IN ('retrieval.rag','retrieval.web')),
        'degraded',count(*) FILTER(WHERE stage IN ('retrieval.rag','retrieval.web') AND outcome='degraded'),
        'firstContentP95Ms',percentile_cont(.95) WITHIN GROUP(ORDER BY duration_ms) FILTER(WHERE stage='llm.first_content' AND outcome='success' AND source=(CASE WHEN EXISTS(SELECT 1 FROM operations_events WHERE stage='llm.first_content' AND source='desktop' AND outcome='success' AND started_at>=LOCALTIMESTAMP-INTERVAL '5 minutes') THEN 'desktop' ELSE 'backend' END)),
        'firstSamples',count(*) FILTER(WHERE stage='llm.first_content' AND outcome='success' AND source=(CASE WHEN EXISTS(SELECT 1 FROM operations_events WHERE stage='llm.first_content' AND source='desktop' AND outcome='success' AND started_at>=LOCALTIMESTAMP-INTERVAL '5 minutes') THEN 'desktop' ELSE 'backend' END)))::text
        FROM operations_events WHERE started_at >= LOCALTIMESTAMP - INTERVAL '5 minutes'
        """)
    String alertWindow();
    @Select("""
        SELECT json_build_object('errors',count(*) FILTER(WHERE stage='asr.complete' AND outcome='error'),
        'firstTranscriptP95Ms',percentile_cont(.95) WITHIN GROUP(ORDER BY duration_ms) FILTER(WHERE stage='asr.first_transcript' AND source='backend' AND outcome='success'),
        'sampleCount',count(*) FILTER(WHERE stage='asr.first_transcript' AND source='backend' AND outcome='success'))::text
        FROM operations_events WHERE started_at>=LOCALTIMESTAMP-INTERVAL '24 hours'
        """)
    String asrHealth();
    // Apply optional dimensions to operations, retaining every stage in the bounded time window.
    String TRACE_GROUPS = """
        FROM operations_events
        WHERE started_at >= LOCALTIMESTAMP - make_interval(hours => #{hours})
        <if test="userId != null">AND user_id=#{userId}</if>
        GROUP BY operation_id,user_id HAVING TRUE
        <if test="sessionId != null">AND bool_or(session_id=#{sessionId})</if>
        <if test="model != null">AND bool_or(model=#{model})</if>
        <if test="appVersion != null">AND bool_or(app_version=#{appVersion})</if>
        """;
    @Select("""
        <script>
        SELECT json_build_object('operationId',operation_id::text,'userId',user_id::text,'sessionId',max(session_id),
        'operationType',CASE WHEN bool_or(stage LIKE 'answer.%' OR stage LIKE 'llm.%') THEN 'answer'
            WHEN bool_or(stage LIKE 'asr.%') THEN 'asr'
            WHEN bool_or(stage IN ('session.sync','session.save')) THEN 'session-sync' ELSE 'other' END,
        'model',CASE WHEN bool_or(stage LIKE 'answer.%' OR stage LIKE 'llm.%') THEN (array_agg(model ORDER BY
            CASE WHEN source='backend' AND stage='llm.complete' THEN 0
                WHEN source='backend' AND stage='llm.first_content' THEN 1
                WHEN stage='llm.complete' THEN 2 WHEN stage='llm.first_content' THEN 3
                WHEN stage='answer.complete' THEN 4 WHEN stage LIKE 'answer.%' THEN 5 ELSE 6 END,
            started_at DESC,event_id DESC)
            FILTER(WHERE NULLIF(model,'') IS NOT NULL AND
                (stage LIKE 'llm.%' OR stage LIKE 'answer.%')))[1]
            WHEN bool_or(stage LIKE 'asr.%') THEN
                (array_agg(model ORDER BY CASE WHEN stage='asr.complete' THEN 0 ELSE 1 END,
                    started_at DESC,event_id DESC) FILTER(WHERE NULLIF(model,'') IS NOT NULL AND stage LIKE 'asr.%'))[1]
            ELSE NULL END,
        'appVersion',(array_agg(app_version ORDER BY CASE WHEN source='desktop' THEN 0 ELSE 1 END,
            started_at DESC,event_id DESC) FILTER(WHERE NULLIF(app_version,'') IS NOT NULL))[1],'startedAt',to_char(min(started_at),'YYYY-MM-DD"T"HH24:MI:SS.US')||'+08:00',
        'outcome',COALESCE(
            (array_agg(outcome ORDER BY started_at DESC,event_id DESC) FILTER(WHERE stage='answer.complete'))[1],
            (array_agg(outcome ORDER BY CASE WHEN source='backend' THEN 0 ELSE 1 END,
                started_at DESC,event_id DESC) FILTER(WHERE stage='llm.complete'))[1],
            CASE WHEN NOT bool_or(stage LIKE 'answer.%' OR stage LIKE 'llm.%') THEN
                COALESCE((array_agg(outcome ORDER BY started_at DESC,event_id DESC) FILTER(WHERE stage='asr.complete'))[1],
                    (array_agg(outcome ORDER BY started_at DESC,event_id DESC) FILTER(WHERE stage='session.sync'))[1]) END,
            (array_agg(outcome ORDER BY CASE WHEN outcome IN ('error','timeout','rejected') THEN 0
                WHEN outcome IN ('cancelled','degraded','empty') THEN 1 ELSE 2 END,
                started_at DESC,event_id DESC))[1]),
        'eventCount',count(*),'clientReported',bool_or(source='desktop'))::text
        """ + TRACE_GROUPS + """
        ORDER BY min(started_at) DESC,operation_id LIMIT #{size} OFFSET #{offset}
        </script>
        """)
    List<String> traces(@Param("hours") int hours, @Param("userId") Long userId, @Param("sessionId") String sessionId,
            @Param("model") String model, @Param("appVersion") String appVersion, @Param("size") int size, @Param("offset") int offset);
    @Select("<script>SELECT count(*) FROM (SELECT operation_id,user_id " + TRACE_GROUPS + ") selected</script>")
    long traceCount(@Param("hours") int hours, @Param("userId") Long userId, @Param("sessionId") String sessionId,
            @Param("model") String model, @Param("appVersion") String appVersion);
    @Select("SELECT payload::text FROM operations_events WHERE operation_id=CAST(#{operationId} AS uuid) AND user_id=#{userId} ORDER BY started_at,event_id LIMIT 1000")
    List<String> detail(@Param("operationId") String operationId, @Param("userId") long userId);
}
