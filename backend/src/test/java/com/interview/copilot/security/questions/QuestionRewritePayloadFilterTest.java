package com.interview.copilot.security.questions;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.common.ApiErrorWriter;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.assertj.core.api.Assertions.assertThat;

class QuestionRewritePayloadFilterTest {
    private final QuestionRewritePayloadFilter filter = new QuestionRewritePayloadFilter(new ApiErrorWriter(new ObjectMapper()));

    @Test
    void doFilter_oversizedBody_rejectsBeforeController() throws Exception {
        var request = new MockHttpServletRequest("POST", "/api/v1/questions/rewrite");
        request.setContent(new byte[256 * 1024 + 1]);
        var response = new MockHttpServletResponse();
        var called = new AtomicBoolean();
        filter.doFilter(request, response, (input, output) -> called.set(true));
        assertThat(response.getStatus()).isEqualTo(413);
        assertThat(called).isFalse();
    }

    @Test
    void doFilter_validBody_preservesExactJsonForController() throws Exception {
        var request = new MockHttpServletRequest("POST", "/api/v1/questions/rewrite");
        byte[] body = "{\"question\":\"问题\",\"context\":[]}".getBytes(StandardCharsets.UTF_8);
        request.setContent(body);
        var response = new MockHttpServletResponse();
        filter.doFilter(request, response, (input, output) -> assertThat(input.getInputStream().readAllBytes()).isEqualTo(body));
        assertThat(response.getStatus()).isEqualTo(200);
    }
}
