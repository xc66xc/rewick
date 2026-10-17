package com.interview.copilot.security.mockinterview;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.util.mockinterview.MockAudioCodec;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.LoggerFactory;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;

/** Session audio lifecycle is independent of the renderer and bounded by state generation and credit. */
final class MockSocketSession {
    private final MockInterviewSocket resources;
    private final WebSocketSession socket;
    private final UserPrincipal user;
    private final UUID id;
    private final Runnable release;
    private final AtomicBoolean closed=new AtomicBoolean();
    private final Object creditLock=new Object();
    private volatile long lastClient=System.nanoTime();
    private volatile int generation=-1;
    private volatile String state="new";
    private volatile UUID turnId;
    private volatile UUID speechId;
    private volatile MockAsrConnection asr;
    private volatile Thread synthesis;
    private int credit;
    private int inputSequence=-1;
    private long sequence;
    private String fingerprint="";
    private volatile String cachedText="";
    private volatile byte[] cachedAudio;
    private long inputClock=System.nanoTime();
    private double allowance=64000;
    MockSocketSession(MockInterviewSocket resources,WebSocketSession socket,UserPrincipal user,UUID id,Runnable release){
        this.resources=resources;this.socket=new ConcurrentWebSocketSessionDecorator(socket,5000,128000);this.user=user;this.id=id;this.release=release;
    }
    void start(){Thread.ofVirtual().name("mock-audio-"+id).start(this::run);}
    private void run(){
        long heartbeat=0;
        try{
            while(!closed.get()){
                if(System.nanoTime()-lastClient>java.util.concurrent.TimeUnit.SECONDS.toNanos(25))throw new IllegalStateException("Client heartbeat expired");
                resources.auth.requireSession(user.id(),user.tokenId());
                JsonNode current=resources.interviews.get(user.id(),id);
                if(System.nanoTime()-heartbeat>java.util.concurrent.TimeUnit.SECONDS.toNanos(10)){
                    heartbeat=System.nanoTime();
                    if(java.util.Set.of("speaking","listening","deciding","starting").contains(current.path("state").asText())){
                        current=resources.interviews.command(user.id(),id,resources.json.parse(resources.json.encode(Map.of("requestId",UUID.randomUUID(),"expectedVersion",current.path("version").asLong(),"command","heartbeat"))));
                    }
                }
                update(current);
                if(java.util.Set.of("completed","error").contains(state)){close(false);return;}
                Thread.sleep(java.util.Set.of("ready","paused").contains(state)?2000:300);
            }
        }catch(Exception error){if(!closed.get())fail(error);}
    }
    private void update(JsonNode current) throws Exception {
        int next=current.path("generation").asInt();String nextState=current.path("state").asText();
        UUID nextTurn=current.path("currentTurnId").isTextual()?UUID.fromString(current.path("currentTurnId").asText()):null;
        boolean changed=next!=generation||!java.util.Objects.equals(nextTurn,turnId);
        if(changed||!"listening".equals(nextState)){var previous=asr;asr=null;if(previous!=null)previous.close();}
        if(changed||!"speaking".equals(nextState)){generation=next;var thread=synthesis;synthesis=null;if(thread!=null)thread.interrupt();synchronized(creditLock){credit=0;creditLock.notifyAll();}}
        generation=next;state=nextState;turnId=nextTurn;
        if("listening".equals(state)&&asr==null&&turnId!=null)openAsr();
        String encoded=current.toString();
        if(!encoded.equals(fingerprint)){
            fingerprint=encoded;ObjectNode payload=current.deepCopy();payload.put("asrReady",asr!=null);
            send("state",payload,generation);
        }
        if("speaking".equals(state)&&synthesis==null&&turnId!=null)startSpeech(current);
    }
    private void openAsr() throws Exception {
        int epoch=generation;UUID expectedTurn=turnId;
        var runtime=resources.interviews.runtime(user.id(),id);
        var endpoint=resources.platforms.snapshot().asr(runtime.path("asrServiceId").asText());
        MockAsrConnection next=new MockAsrConnection(endpoint,resources.json,transcript->{
            if(!closed.get()&&generation==epoch&&"listening".equals(state))send(transcript.path("isFinal").asBoolean()?"transcript.final":"transcript.partial",transcript,epoch);
        },this::fail);
        asr=next;inputSequence=-1;inputClock=System.nanoTime();allowance=64000;
        try{next.connect(resources.http,endpoint);}catch(Exception error){next.close();asr=null;throw error;}
        if(generation!=epoch||!java.util.Objects.equals(turnId,expectedTurn)){next.close();asr=null;}
    }
    private void startSpeech(JsonNode current){
        int epoch=generation;UUID activeSpeech=UUID.randomUUID();speechId=activeSpeech;credit=0;
        String question="";for(JsonNode turn:current.path("turns"))if(turn.path("id").asText().equals(turnId.toString()))question=turn.path("question").asText();
        String text=question;String voice=current.path("voiceId").asText();
        synthesis=Thread.ofVirtual().name("mock-speech-"+id).unstarted(()->{
            try{
                JsonNode runtime=resources.interviews.runtime(user.id(),id);
                send("speech.start",Map.of("speechId",activeSpeech,"sampleRate",24000,"channels",1,"format","pcm16"),epoch);
                AtomicInteger chunks=new AtomicInteger();ByteArrayOutputStream cache=new ByteArrayOutputStream();
                java.util.function.Consumer<byte[]> audio=pcm->{
                    if(cache.size()+pcm.length>6*1024*1024)throw new IllegalStateException("Audio capacity");
                    cache.writeBytes(pcm);deliver(epoch,activeSpeech,chunks.getAndIncrement(),pcm);
                };
                byte[] previous=cachedAudio;
                if(text.equals(cachedText)&&previous!=null){for(int offset=0;offset<previous.length;offset+=32768)audio.accept(java.util.Arrays.copyOfRange(previous,offset,Math.min(previous.length,offset+32768)));}
                else {
                    if(!resources.interviews.reserveSpeech(user.id(),id,epoch,text.length()))
                        throw new ApiException(org.springframework.http.HttpStatus.CONFLICT,"MOCK_SPEECH_RESERVED","本轮语音已经请求，请暂停后重试。");
                    resources.speech.stream(runtime,text,voice,audio,()->closed.get()||generation!=epoch||Thread.currentThread().isInterrupted());
                }
                if(generation==epoch&&!closed.get()){
                    cachedAudio=cache.toByteArray();cachedText=text;send("speech.end",Map.of("speechId",activeSpeech),epoch);
                }
            }catch(java.util.concurrent.CancellationException ignored){/* invalidated generation */}
            catch(Exception error){if(!closed.get()&&generation==epoch)fail(error);}
        });synthesis.start();
    }
    private void deliver(int epoch,UUID activeSpeech,int index,byte[] pcm){
        synchronized(creditLock){
            long deadline=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(15);
            while(credit<pcm.length){
                if(closed.get()||generation!=epoch||Thread.currentThread().isInterrupted())throw new java.util.concurrent.CancellationException();
                if(System.nanoTime()>deadline)throw new IllegalStateException("Playback credit expired");
                try{creditLock.wait(100);}catch(InterruptedException error){Thread.currentThread().interrupt();throw new java.util.concurrent.CancellationException();}
            }
            credit-=pcm.length;
        }
        if(closed.get()||generation!=epoch)throw new java.util.concurrent.CancellationException();
        try{socket.sendMessage(new BinaryMessage(MockAudioCodec.encode(epoch,activeSpeech,index,pcm)));}
        catch(Exception error){throw new IllegalStateException("Audio connection closed",error);}
    }
    void text(String value){
        try{
            if(value.length()>16384)throw new IllegalArgumentException("Control frame size");
            JsonNode input=resources.json.parse(value);String kind=input.path("kind").asText();
            if("heartbeat".equals(kind)||"connect".equals(kind)){lastClient=System.nanoTime();return;}
            if(!"playback.credit".equals(kind))throw new IllegalArgumentException("Unknown audio control");
            if(input.path("generation").asInt(-1)!=generation||speechId==null||!speechId.toString().equals(input.path("speechId").asText()))return;
            int bytes=input.path("bytes").asInt();if(bytes<=0||bytes>96000)throw new IllegalArgumentException("Invalid playback credit");
            synchronized(creditLock){credit=Math.min(96000,credit+bytes);creditLock.notifyAll();}
        }catch(RuntimeException error){fail(error);}
    }
    void audio(ByteBuffer input){
        try{
            var frame=MockAudioCodec.decode(input,0);
            if(frame.generation()!=generation||!frame.itemId().equals(turnId)||!"listening".equals(state))return;
            if(frame.sequence()<=inputSequence)return;
            if(frame.sequence()!=inputSequence+1)throw new IllegalStateException("Missing microphone packet");inputSequence=frame.sequence();
            long now=System.nanoTime();allowance=Math.min(64000,allowance+(now-inputClock)/1e9*32000);inputClock=now;
            allowance-=frame.pcm().length;if(allowance<0)throw new IllegalStateException("Microphone backlog");
            var active=asr;if(active!=null)active.send(frame.pcm());
        }catch(RuntimeException error){fail(error);}
    }
    private synchronized void send(String kind,Object payload,int epoch){
        if(closed.get())return;
        try{socket.sendMessage(new TextMessage(resources.json.encode(Map.of("protocolVersion",1,"sessionId",id,"kind",kind,"generation",epoch,"sequence",++sequence,"payload",payload))));}
        catch(Exception error){close(true);}
    }
    private void fail(Throwable error){
        if(closed.get())return;
        LoggerFactory.getLogger(getClass()).warn("Mock audio session failed user={} session={} type={}",user.id(),id,error.getClass().getSimpleName());
        send("error",Map.of("code",error instanceof ApiException api?api.code():"MOCK_AUDIO_FAILED","message","语音连接中断，面试已暂停，请重试。"),generation);
        close(true);
    }
    void close(boolean pause){
        if(!closed.compareAndSet(false,true))return;
        var listening=asr;asr=null;if(listening!=null)listening.close();
        var talking=synthesis;if(talking!=null)talking.interrupt();
        synchronized(creditLock){creditLock.notifyAll();}
        cachedAudio=null;release.run();
        try{socket.close();}catch(Exception ignored){/* already closed */}
        if(pause)try{resources.interviews.pause(user.id(),id,"audio_disconnected");}catch(RuntimeException error){LoggerFactory.getLogger(getClass()).warn("Mock disconnect settlement failed user={} session={}",user.id(),id);}
    }
}
