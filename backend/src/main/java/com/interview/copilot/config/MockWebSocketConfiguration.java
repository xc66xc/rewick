package com.interview.copilot.config;

import com.interview.copilot.security.mockinterview.MockInterviewSocket;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
public class MockWebSocketConfiguration implements WebSocketConfigurer {
    private final MockInterviewSocket socket;
    public MockWebSocketConfiguration(MockInterviewSocket socket){this.socket=socket;}
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry){registry.addHandler(socket,"/ws/v1/mock-interviews/*");}
}
