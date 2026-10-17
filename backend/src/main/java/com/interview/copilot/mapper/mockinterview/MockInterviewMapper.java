package com.interview.copilot.mapper.mockinterview;

import com.interview.copilot.entity.mockinterview.MockSessionEntity;
import com.interview.copilot.entity.mockinterview.MockCommandEntity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Update;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface MockInterviewMapper {
 @Select("SELECT id FROM mock_interview_config WHERE id=1 FOR UPDATE") int lockCapacity();
 String COLS="id::text,app_users_id AS user_id,request_hash,snapshot::text,config::text,state,version,generation,duration_minutes,used_seconds,current_turn_id::text,report_status,error,created_at,updated_at";
 @Select("SELECT "+COLS+" FROM mock_interviews WHERE app_users_id=#{user} AND id=CAST(#{id} AS uuid) AND deleted_at IS NULL") MockSessionEntity get(@Param("user") long user,@Param("id") String id);
 @Select("SELECT "+COLS+" FROM mock_interviews WHERE app_users_id=#{user} AND request_id=CAST(#{request} AS uuid)") MockSessionEntity request(@Param("user") long user,@Param("request") String request);
 @Select("SELECT "+COLS+" FROM mock_interviews WHERE app_users_id=#{user} AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100") List<MockSessionEntity> list(long user);
 @Select("SELECT "+COLS+" FROM mock_interviews WHERE state NOT IN ('ready','paused','completed','error') OR (state='paused' AND updated_at<LOCALTIMESTAMP(6)-INTERVAL '10 minutes')") List<MockSessionEntity> active();
 @Select("SELECT count(*) FROM mock_interviews WHERE state NOT IN ('ready','paused','completed','error')") int activeCount();
 @Select("SELECT count(*) FROM mock_interviews WHERE app_users_id=#{user} AND created_at>=date_trunc('day',LOCALTIMESTAMP)") int daily(long user);
 @Insert("INSERT INTO mock_interviews(id,app_users_id,request_id,request_hash,environment_id,snapshot,config,duration_minutes) VALUES(CAST(#{id} AS uuid),#{user},CAST(#{request} AS uuid),#{hash},CAST(#{environment} AS uuid),CAST(#{snapshot} AS jsonb),CAST(#{config} AS jsonb),#{duration})")
 void create(@Param("user") long user,@Param("id") String id,@Param("request") String request,@Param("hash") String hash,@Param("environment") String environment,@Param("snapshot") String snapshot,@Param("config") String config,@Param("duration") int duration);
 @Update("UPDATE mock_interviews SET state=#{state},generation=generation+#{bump},version=version+1,error=#{error},updated_at=LOCALTIMESTAMP(6) WHERE app_users_id=#{user} AND id=CAST(#{id} AS uuid)")
 void state(@Param("user") long user,@Param("id") String id,@Param("state") String state,@Param("bump") int bump,@Param("error") String error);
 @Update("UPDATE mock_interviews SET used_seconds=used_seconds+#{delta} WHERE id=CAST(#{id} AS uuid)") void used(@Param("id") String id,@Param("delta") long delta);
 @Select("SELECT jsonb_build_object('id',id,'number',turn_number,'question',question,'answerText',answer_text,'status',status,'assessment',assessment)::text FROM mock_turns WHERE session_id=CAST(#{id} AS uuid) ORDER BY turn_number") List<String> turns(String id);
 @Insert("INSERT INTO mock_turns(id,session_id,app_users_id,turn_number,topic_id,question,assessment) SELECT CAST(#{turn} AS uuid),CAST(#{id} AS uuid),#{user},coalesce(max(turn_number),0)+1,#{topic},#{question},CAST(#{assessment} AS jsonb) FROM mock_turns WHERE session_id=CAST(#{id} AS uuid)")
 void turn(@Param("user") long user,@Param("id") String id,@Param("turn") String turn,@Param("topic") String topic,@Param("question") String question,@Param("assessment") String assessment);
 @Update("UPDATE mock_interviews SET current_turn_id=CAST(#{turn} AS uuid) WHERE id=CAST(#{id} AS uuid)") void current(@Param("id") String id,@Param("turn") String turn);
 @Update("UPDATE mock_turns SET answer_text=#{answer},status=#{status} WHERE session_id=CAST(#{id} AS uuid) AND id=CAST(#{turn} AS uuid) AND status='pending'") int answer(@Param("id") String id,@Param("turn") String turn,@Param("answer") String answer,@Param("status") String status);
 @Select("SELECT payload_hash,result::text FROM mock_commands WHERE app_users_id=#{user} AND session_id=CAST(#{id} AS uuid) AND request_id=CAST(#{request} AS uuid)") MockCommandEntity command(@Param("user") long user,@Param("id") String id,@Param("request") String request);
 @Insert("INSERT INTO mock_commands(app_users_id,session_id,request_id,payload_hash,result) VALUES(#{user},CAST(#{id} AS uuid),CAST(#{request} AS uuid),#{hash},CAST(#{result} AS jsonb))") void record(@Param("user") long user,@Param("id") String id,@Param("request") String request,@Param("hash") String hash,@Param("result") String result);
 @Insert("INSERT INTO mock_events(session_id,sequence,payload) VALUES(CAST(#{id} AS uuid),#{version},CAST(#{payload} AS jsonb)) ON CONFLICT DO NOTHING") void event(@Param("id") String id,@Param("version") long version,@Param("payload") String payload);
 @Insert("INSERT INTO mock_reports(session_id) VALUES(CAST(#{id} AS uuid)) ON CONFLICT DO NOTHING") void enqueue(String id);
 @Select("SELECT jsonb_build_object('status',status,'report',report,'error',error)::text FROM mock_reports WHERE session_id=CAST(#{id} AS uuid)") String report(String id);
 @Update("UPDATE mock_reports SET status=#{status},report=CAST(#{report} AS jsonb),error=#{error},updated_at=LOCALTIMESTAMP(6),lease_until=NULL WHERE session_id=CAST(#{id} AS uuid)") void reportSave(@Param("id") String id,@Param("status") String status,@Param("report") String report,@Param("error") String error);
 @Update("UPDATE mock_interviews SET report_status=#{status} WHERE id=CAST(#{id} AS uuid)") void reportStatus(@Param("id") String id,@Param("status") String status);
 @Update("UPDATE mock_reports SET status='running',attempts=attempts+1,lease_until=LOCALTIMESTAMP(6)+INTERVAL '90 seconds' WHERE session_id=CAST(#{id} AS uuid) AND attempts<3 AND (status='pending' OR (status='running' AND lease_until<LOCALTIMESTAMP(6)))") int claimReport(String id);
 @Select("SELECT "+COLS+" FROM mock_interviews WHERE deleted_at IS NULL AND id IN (SELECT session_id FROM mock_reports WHERE status='pending' OR (status='running' AND lease_until<LOCALTIMESTAMP(6))) LIMIT 5") List<MockSessionEntity> reports();
 @Update("UPDATE mock_interviews SET deleted_at=LOCALTIMESTAMP(6),snapshot='{}'::jsonb WHERE app_users_id=#{user} AND id=CAST(#{id} AS uuid)") void delete(@Param("user") long user,@Param("id") String id);
 @Update("DELETE FROM mock_turns WHERE session_id=CAST(#{id} AS uuid)") void deleteTurns(String id);
 @Update("UPDATE mock_interviews SET tts_characters=tts_characters+#{characters},speech_generation=#{generation} WHERE app_users_id=#{user} AND id=CAST(#{id} AS uuid) AND generation=#{generation} AND state='speaking' AND speech_generation<>#{generation} AND tts_characters+#{characters}<=CAST(config->>'maxTtsCharacters' AS int)")
 int reserveSpeech(@Param("user") long user,@Param("id") String id,@Param("generation") int generation,@Param("characters") int characters);
 @Update("UPDATE mock_reports SET status='pending',error=NULL WHERE session_id=CAST(#{id} AS uuid) AND status='failed' AND attempts<3") int retryReport(String id);
 @Update("UPDATE mock_commands SET result='{}'::jsonb WHERE session_id=CAST(#{id} AS uuid)") void scrubCommands(String id);
 @Update("UPDATE mock_events SET payload='{}'::jsonb WHERE session_id=CAST(#{id} AS uuid)") void scrubEvents(String id);
 @Update("UPDATE mock_reports SET status='failed',report=NULL,error='报告生成任务中断且已达到三次上限。',lease_until=NULL,updated_at=LOCALTIMESTAMP(6) WHERE session_id=CAST(#{id} AS uuid) AND attempts>=3 AND (status='pending' OR (status='running' AND lease_until<LOCALTIMESTAMP(6)))")
 int failExhaustedReport(String id);
}
