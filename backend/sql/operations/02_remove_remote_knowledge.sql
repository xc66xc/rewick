-- ONLY the independent copilot_operations database. Stop collectors while applying.
-- Remove retired provider samples; preserve all shared retrieval/answer billing metrics.
BEGIN;
SET LOCAL lock_timeout = '5s';
WITH removed AS (
 DELETE FROM operations_events WHERE provider_type='bailian' RETURNING event_id
) DELETE FROM operations_event_ids WHERE event_id IN (SELECT event_id FROM removed);
DELETE FROM operations_histograms WHERE provider_type='bailian';
-- Derived snapshots are rebuildable and must not keep retired provider labels.
DELETE FROM operations_snapshots WHERE payload::text LIKE '%"bailian"%';
COMMIT;
