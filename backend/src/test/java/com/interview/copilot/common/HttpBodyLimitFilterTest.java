package com.interview.copilot.common;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import static org.assertj.core.api.Assertions.assertThat;

class HttpBodyLimitFilterTest {
    @Test
    void filter_chunkedOversizeBody_rejectsBeforeController() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/answers") {
            @Override public long getContentLengthLong() { return -1; }
        };
        request.setContent(new byte[1048577]);
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean called = new AtomicBoolean();

        new HttpBodyLimitFilter(new ApiErrorWriter(new ObjectMapper())).doFilter(request, response,
                (incoming, outgoing) -> called.set(true));

        assertThat(response.getStatus()).isEqualTo(413);
        assertThat(called).isFalse();
    }
}
