INSERT INTO app_users(id,display_name,password_hash) VALUES(101,'migration-user','preserved-hash');
INSERT INTO time_wallets(app_users_id,available_seconds) VALUES(101,4321);
UPDATE platform_config SET version=7,is_published=TRUE,payload='{
 "version":7,"defaultModelId":"llm-model","temperature":0.6,
 "providers":[{"id":"llm","kind":"llm","encryptedKey":"encrypted-llm"},{"id":"rag","kind":"knowledge","encryptedKey":"encrypted-remote"},{"id":"web","kind":"web-search","encryptedKey":"encrypted-web"}],
 "knowledge":{"enabled":true,"providerId":"rag","agentId":"retired-agent"},
 "asr":{"providerId":"speech"},"embedding":{"providerId":"embed","dimensions":1024},"webSearch":{"enabled":true,"topK":5}
}'::jsonb WHERE id=1;
UPDATE desktop_settings SET version=3,llm_model_id='llm-model',temperature=0.6,
 asr_service_id='speech',retrieval_mode='remote',knowledge_service_id='rag' WHERE id=1;
INSERT INTO user_preferences(app_users_id,version,payload) VALUES(101,2,'{
 "retrievalEnabled":true,"remoteKnowledgeEnabled":true,"webSearchEnabled":true,
 "platformSelections":{"llm":"llm-model","asr":"speech","knowledge":"rag"},
 "answerStyle":"concise","temperature":0.6
}'::jsonb);
INSERT INTO session_records(record_id,app_users_id,title,started_at,mutation_id,content) VALUES(
 'preserved-record',101,'保留问答',LOCALTIMESTAMP,'00000000-0000-0000-0000-000000000010','{
 "id":"preserved-record","title":"保留问答","segments":[],"answers":[{
 "question":"如何设计缓存？","text":"答案正文保持不变","modelInput":{"remote":{"host":"original-user-input"},"examples":[{"kind":"knowledge","source":"bailian","text":"原始示例"}],"remoteKnowledge":{"original":true},"messages":[{"role":"user","content":"原始问题文本"}]},
 "retrieval":{"status":"ready","remote":{"agentId":"retired-agent","status":"ready"},"excerpts":[
 {"source":"bailian","text":"远程旧摘录"},{"source":"platform","text":"本地原摘录"},{"source":"web","text":"网页原摘录"}]}}]
}'::jsonb);
INSERT INTO interview_sessions(session_id,app_users_id,request_id,status,started_at,expires_at,background_snapshot)
 VALUES('00000000-0000-0000-0000-000000000011',101,'00000000-0000-0000-0000-000000000012','ended',LOCALTIMESTAMP,LOCALTIMESTAMP,'{
 "retrieval":{"enabled":true},"remoteKnowledge":{"enabled":true,"agentId":"retired-agent"},"context":{"text":"简历原文"}
}'::jsonb);
INSERT INTO mock_interviews(id,app_users_id,request_id,request_hash,environment_id,snapshot,config,state,duration_minutes)
 VALUES('00000000-0000-0000-0000-000000000013',101,'00000000-0000-0000-0000-000000000014','preserved-hash',
 '00000000-0000-0000-0000-000000000015','{"resumeText":"简历原文","remoteKnowledge":{"enabled":true},"services":{"asr":[],"knowledge":[]}}','{}','completed',15);
INSERT INTO reference_documents(id,app_users_id,name,content_hash,file_size)
 VALUES('00000000-0000-0000-0000-000000000016',101,'保留资料.md',repeat('a',64),100);
INSERT INTO usage_events(app_users_id,request_id,capability,status,expires_at)
 VALUES(101,'preserved-local-retrieval','knowledge','complete',LOCALTIMESTAMP);
