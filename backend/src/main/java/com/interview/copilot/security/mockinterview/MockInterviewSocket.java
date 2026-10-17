package com.interview.copilot.security.mockinterview;

import com.interview.copilot.security.asr.AsrProxy;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.auth.SessionGuardService;
import com.interview.copilot.service.mockinterview.MockInterviewService;
import com.interview.copilot.service.mockinterview.MockSpeechService;
import com.interview.copilot.service.platform.PlatformRuntimeService;
import com.interview.copilot.util.ai.ProviderJson;
import jakarta.annotation.PreDestroy;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.AbstractWebSocketHandler;

/** Authenticated, account-owned audio channel. REST remains authoritative for state changes. */
@Component
public class MockInterviewSocket extends AbstractWebSocketHandler {
    final MockInterviewService interviews;
    final MockSpeechService speech;
    final PlatformRuntimeService platforms;
    final SessionGuardService auth;
    final ProviderJson json;
    final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final ConcurrentHashMap<String,MockSocketSession> connections=new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String,String> owners=new ConcurrentHashMap<>();
    public MockInterviewSocket(MockInterviewService interviews,MockSpeechService speech,PlatformRuntimeService platforms,SessionGuardService auth,ProviderJson json){
        this.interviews=interviews;this.speech=speech;this.platforms=platforms;this.auth=auth;this.json=json;
    }
    public void afterConnectionEstablished(WebSocketSession socket) throws Exception {
        UserPrincipal user=AsrProxy.principal(socket.getPrincipal());
        if(user==null||!"desktop".equals(user.clientType())){socket.close(CloseStatus.POLICY_VIOLATION);return;}
        String path=socket.getUri().getPath();UUID id=UUID.fromString(path.substring(path.lastIndexOf('/')+1));
        auth.requireSession(user.id(),user.tokenId());interviews.get(user.id(),id);
        String key=Long.toString(user.id());
        if(owners.putIfAbsent(key,socket.getId())!=null){socket.close(CloseStatus.POLICY_VIOLATION.withReason("会话已在另一连接使用"));return;}
        socket.setBinaryMessageSizeLimit(65564);socket.setTextMessageSizeLimit(16384);
        var connection=new MockSocketSession(this,socket,user,id,()->{connections.remove(socket.getId());owners.remove(key,socket.getId());});
        connections.put(socket.getId(),connection);connection.start();
    }
    protected void handleTextMessage(WebSocketSession socket,TextMessage message){var connection=connections.get(socket.getId());if(connection!=null)connection.text(message.getPayload());}
    protected void handleBinaryMessage(WebSocketSession socket,BinaryMessage message){var connection=connections.get(socket.getId());if(connection!=null)connection.audio(message.getPayload());}
    public void handleTransportError(WebSocketSession socket,Throwable error){var connection=connections.get(socket.getId());if(connection!=null)connection.close(true);}
    public void afterConnectionClosed(WebSocketSession socket,CloseStatus status){var connection=connections.get(socket.getId());if(connection!=null)connection.close(true);}
    @PreDestroy public void shutdown(){connections.values().forEach(connection->connection.close(true));http.shutdownNow();}
}
