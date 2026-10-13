-- Run ONLY in independent copilot_operations database, never the business database.
BEGIN;
CREATE TABLE IF NOT EXISTS operations_settings (
 id BIGINT PRIMARY KEY CHECK(id=1), version BIGINT NOT NULL DEFAULT 0,
 payload JSONB NOT NULL DEFAULT '{"enabled":false,"allowedUserIds":[]}'::jsonb,
 updated_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6)
);
INSERT INTO operations_settings(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS operations_event_ids (
 event_id UUID PRIMARY KEY, created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6)
);
CREATE INDEX IF NOT EXISTS operations_event_ids_created ON operations_event_ids(created_at);
CREATE TABLE IF NOT EXISTS operations_events (
 event_id UUID NOT NULL, operation_id UUID NOT NULL, user_id BIGINT NOT NULL,
 stage VARCHAR(40) NOT NULL, source VARCHAR(8) NOT NULL, provider_type VARCHAR(16) NOT NULL,
 outcome VARCHAR(16) NOT NULL, duration_ms DOUBLE PRECISION NOT NULL CHECK(duration_ms>=0),
 model VARCHAR(200), app_version VARCHAR(32), session_id VARCHAR(128),
 started_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL, payload JSONB NOT NULL,
 server_only BOOLEAN NOT NULL, token_sample BOOLEAN NOT NULL,
 created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6),
 PRIMARY KEY(event_id,started_at)
) PARTITION BY RANGE(started_at);
CREATE INDEX IF NOT EXISTS operations_events_trace ON operations_events(user_id,operation_id,started_at);
CREATE INDEX IF NOT EXISTS operations_events_time ON operations_events(started_at);
CREATE INDEX IF NOT EXISTS operations_events_filters ON operations_events(model,app_version,started_at);
-- Fixed buckets only: 90-day trends retain no operation/user/model/version identities.
CREATE TABLE IF NOT EXISTS operations_histograms (
 at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL, stage VARCHAR(40) NOT NULL,
 source VARCHAR(8) NOT NULL, provider_type VARCHAR(16) NOT NULL, outcome VARCHAR(16) NOT NULL,
 bucket_ms DOUBLE PRECISION NOT NULL, sample_count BIGINT NOT NULL,
 server_only_count BIGINT NOT NULL, token_samples BIGINT NOT NULL,
 PRIMARY KEY(at,stage,source,provider_type,outcome,bucket_ms)
) PARTITION BY RANGE(at);
CREATE INDEX IF NOT EXISTS operations_histograms_time ON operations_histograms(at);
CREATE TABLE IF NOT EXISTS operations_answers (
 operation_id UUID NOT NULL,user_id BIGINT NOT NULL,at TIMESTAMP(6) NOT NULL,
 outcome VARCHAR(16) NOT NULL,priority INTEGER NOT NULL,PRIMARY KEY(operation_id,user_id)
);
CREATE TABLE IF NOT EXISTS operations_answer_totals (
 at TIMESTAMP(6) NOT NULL,outcome VARCHAR(16) NOT NULL,sample_count BIGINT NOT NULL,
 PRIMARY KEY(at,outcome)
) PARTITION BY RANGE(at);
CREATE TABLE IF NOT EXISTS operations_audit (
 id BIGSERIAL PRIMARY KEY, actor_id BIGINT NOT NULL, version BIGINT NOT NULL,
 created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6)
);
CREATE TABLE IF NOT EXISTS operations_snapshots (
 name VARCHAR(64) PRIMARY KEY, payload JSONB NOT NULL,
 updated_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL DEFAULT LOCALTIMESTAMP(6)
);
-- Partition maintenance only; never creates business schema or touches another database.
CREATE OR REPLACE FUNCTION operations_partition_maintenance(budget_bytes BIGINT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE parent_name TEXT; partition_name TEXT; target_day DATE; keep_days INTEGER;
 dropped INTEGER := 0; candidate RECORD;
BEGIN
 DELETE FROM operations_event_ids WHERE event_id IN (SELECT event_id FROM operations_event_ids WHERE created_at<LOCALTIMESTAMP-INTERVAL '7 days' ORDER BY created_at LIMIT 10000);
 FOR parent_name,keep_days IN VALUES('operations_events',7),('operations_histograms',90),('operations_answer_totals',90) LOOP
  FOR target_day IN SELECT generate_series(current_date-keep_days,current_date+3,INTERVAL '1 day')::date LOOP
   partition_name := parent_name||'_d'||to_char(target_day,'YYYYMMDD');
   EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',partition_name,parent_name,target_day,target_day+1);
  END LOOP;
  FOR candidate IN SELECT child.relname AS name FROM pg_inherits i
   JOIN pg_class child ON child.oid=i.inhrelid JOIN pg_class parent ON parent.oid=i.inhparent
   WHERE parent.relname=parent_name AND child.relname ~ ('^'||parent_name||'_d[0-9]{8}$')
   AND to_date(right(child.relname,8),'YYYYMMDD') < current_date-keep_days ORDER BY child.relname LOOP
   EXECUTE format('DROP TABLE %I',candidate.name); dropped:=dropped+1;
  END LOOP;
 END LOOP;
 -- Capacity pressure removes at most one oldest non-today partition per pass, releasing its file.
 -- No repeated DELETE of live rows based on unchanged physical size.
 IF budget_bytes>0 AND pg_database_size(current_database())>budget_bytes THEN
  SELECT child.relname AS name INTO candidate FROM pg_inherits i JOIN pg_class child ON child.oid=i.inhrelid
   JOIN pg_class parent ON parent.oid=i.inhparent WHERE parent.relname IN ('operations_events','operations_histograms','operations_answer_totals')
   AND child.relname ~ '^operations_(events|histograms|answer_totals)_d[0-9]{8}$'
   AND to_date(right(child.relname,8),'YYYYMMDD') < current_date AND pg_relation_size(child.oid)>0 ORDER BY right(child.relname,8),pg_total_relation_size(child.oid) DESC LIMIT 1;
  IF candidate.name IS NOT NULL THEN EXECUTE format('DROP TABLE %I',candidate.name);dropped:=dropped+1;END IF;
 END IF;
 RETURN dropped;
END $$;
SELECT operations_partition_maintenance(0);
COMMIT;
