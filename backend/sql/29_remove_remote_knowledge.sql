-- Apply to the business database after 28_reference_qa.sql, with the backend stopped.
-- Removes retired remote-KB configuration and excerpts; keeps questions/answers and local indexes.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.remove_remote_knowledge(value JSONB, parent_key TEXT DEFAULT '') RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE result JSONB; item RECORD; child JSONB;
BEGIN
 IF jsonb_typeof(value) = 'array' THEN
  result := '[]'::jsonb;
  FOR child IN SELECT e.value FROM jsonb_array_elements(value) AS e(value) LOOP
   IF parent_key = 'excerpts' AND child->>'source' = 'bailian' THEN CONTINUE; END IF;
   IF parent_key IN ('providers','customServices') AND child->>'kind' = 'knowledge' THEN CONTINUE; END IF;
   result := result || jsonb_build_array(pg_temp.remove_remote_knowledge(child,parent_key));
  END LOOP;
  RETURN result;
 ELSIF jsonb_typeof(value) = 'object' THEN
  result := '{}'::jsonb;
  FOR item IN SELECT e.key,e.value FROM jsonb_each(value) AS e(key,value) LOOP
   IF item.key IN ('remoteKnowledge','remoteKnowledgeEnabled','remoteKnowledgeApiKey',
       'encryptedRemoteKnowledgeApiKey','knowledgeServiceId','retrievalMode') THEN CONTINUE; END IF;
   IF parent_key = 'retrieval' AND item.key = 'remote' THEN CONTINUE; END IF;
   -- Original prompts and user text are opaque payloads, never business settings.
   IF item.key IN ('modelInput','text','question','content','messages','raw') THEN
    result := result || jsonb_build_object(item.key,item.value);
    CONTINUE;
   END IF;
   child := pg_temp.remove_remote_knowledge(item.value,item.key);
   IF item.key IN ('platformSelections','serviceSelections','services','capabilities','models')
       AND jsonb_typeof(child) = 'object' THEN child := child - 'knowledge'; END IF;
   result := result || jsonb_build_object(item.key,child);
  END LOOP;
  RETURN result;
 END IF;
 RETURN value;
END $$;

UPDATE platform_config SET payload=pg_temp.remove_remote_knowledge(payload)-'knowledge',
 version=version+1,updated_at=LOCALTIMESTAMP(6)
 WHERE payload IS DISTINCT FROM pg_temp.remove_remote_knowledge(payload)-'knowledge';

-- Some narrow test/installation schemas omit optional business modules.
DO $$
BEGIN
 IF to_regclass('user_preferences') IS NOT NULL THEN
  UPDATE user_preferences SET payload=pg_temp.remove_remote_knowledge(payload),
   version=version+1,updated_at=LOCALTIMESTAMP(6)
   WHERE payload IS DISTINCT FROM pg_temp.remove_remote_knowledge(payload);
  ALTER TABLE user_preferences ALTER COLUMN payload SET DEFAULT
   '{"answerStyle":"concise","temperature":0.5,"silenceMs":800,"autoAnswer":{"enabled":true,"pauseMs":1500},"retrievalEnabled":false,"platformSelections":{"llm":null,"asr":null}}'::jsonb;
 END IF;
 IF to_regclass('desktop_settings') IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema()
      AND table_name='desktop_settings' AND column_name IN ('retrieval_mode','knowledge_service_id')) THEN
   UPDATE desktop_settings SET version=version+1,updated_at=LOCALTIMESTAMP(6);
  END IF;
  ALTER TABLE desktop_settings DROP COLUMN IF EXISTS retrieval_mode;
  ALTER TABLE desktop_settings DROP COLUMN IF EXISTS knowledge_service_id;
 END IF;
 IF to_regclass('session_records') IS NOT NULL THEN
  UPDATE session_records SET content=pg_temp.remove_remote_knowledge(content),
   version=version+1,updated_at=LOCALTIMESTAMP(6)
   WHERE content IS DISTINCT FROM pg_temp.remove_remote_knowledge(content);
 END IF;
 IF to_regclass('interview_sessions') IS NOT NULL AND EXISTS(
    SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema()
      AND table_name='interview_sessions' AND column_name='background_snapshot') THEN
  UPDATE interview_sessions SET background_snapshot=pg_temp.remove_remote_knowledge(background_snapshot)
   WHERE background_snapshot IS DISTINCT FROM pg_temp.remove_remote_knowledge(background_snapshot);
 END IF;
 IF to_regclass('mock_interviews') IS NOT NULL THEN
  UPDATE mock_interviews SET snapshot=pg_temp.remove_remote_knowledge(snapshot),
   version=version+1,updated_at=LOCALTIMESTAMP(6)
   WHERE snapshot IS DISTINCT FROM pg_temp.remove_remote_knowledge(snapshot);
 END IF;
END $$;
DROP FUNCTION pg_temp.remove_remote_knowledge(JSONB,TEXT);
COMMIT;
