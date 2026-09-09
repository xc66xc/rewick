package com.interview.copilot.asr;

import com.interview.copilot.common.ApiException;
import java.util.Map;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.HandshakeInterceptor;

@Configuration
@EnableWebSocket
public class AsrWebSocketConfiguration implements WebSocketConfigurer {
    private final AsrProxy proxy;
    public AsrWebSocketConfiguration(AsrProxy proxy) { this.proxy = proxy; }

    @Override public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(proxy, "/api/v1/asr").addInterceptors(new AvailabilityHandshake(proxy));
    }

    private record AvailabilityHandshake(AsrProxy proxy) implements HandshakeInterceptor {
        @Override public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                                  WebSocketHandler handler, Map<String, Object> attributes) {
            if (AsrProxy.principal(request.getPrincipal()) == null) {
                response.setStatusCode(HttpStatus.UNAUTHORIZED);
                return false;
            }
            try {
                proxy.checkAvailable(request.getURI());
                return true;
            } catch (ApiException exception) {
                response.setStatusCode(exception.status());
                return false;
            }
        }

        @Override public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                               WebSocketHandler handler, Exception exception) { }
    }
}
