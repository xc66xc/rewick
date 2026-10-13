package com.interview.copilot.common.operations;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.common.ApiErrorWriter;
import com.interview.copilot.security.auth.BearerTokenFilter;
import com.interview.copilot.service.auth.AuthService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class OperationsMetricsAuthTest {
    private final AuthService auth=mock(AuthService.class);
    private final BearerTokenFilter filter=new BearerTokenFilter(auth,new ApiErrorWriter(new ObjectMapper()),"fixture-metrics-token",9091);
    @AfterEach void clear() {SecurityContextHolder.clearContext();}
    @Test void metrics_correctPrivatePortAndSecret_bypassesBusinessAuthenticationDatabase() throws Exception {
        var request=request(9091,"Bearer fixture-metrics-token");var response=new MockHttpServletResponse();var called=new AtomicBoolean();
        filter.doFilter(request,response,(req,res) -> called.set(true));
        assertThat(called).isTrue();verifyNoInteractions(auth);
    }
    @Test void metrics_publicBusinessPort_rejectsEvenCorrectSecret() throws Exception {
        var response=new MockHttpServletResponse();filter.doFilter(request(8080,"Bearer fixture-metrics-token"),response,(req,res) -> {throw new AssertionError("must not continue");});
        assertThat(response.getStatus()).isEqualTo(403);verifyNoInteractions(auth);
    }
    @Test void metrics_privatePortWrongSecret_rejectsWithoutBusinessAuthentication() throws Exception {
        var response=new MockHttpServletResponse();filter.doFilter(request(9091,"Bearer wrong"),response,(req,res) -> {throw new AssertionError("must not continue");});
        assertThat(response.getStatus()).isEqualTo(403);verifyNoInteractions(auth);
    }
    private MockHttpServletRequest request(int port,String header) {
        var request=new MockHttpServletRequest("GET","/actuator/prometheus");request.setLocalPort(port);request.addHeader("Authorization",header);return request;
    }
}
