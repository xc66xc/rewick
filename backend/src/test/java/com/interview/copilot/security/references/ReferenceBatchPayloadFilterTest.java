package com.interview.copilot.security.references;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.common.ApiErrorWriter;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.assertj.core.api.Assertions.assertThat;

class ReferenceBatchPayloadFilterTest {
    @Test
    void filter_chunkedOversizedBody_rejectsBeforeParsing() throws Exception {
        var request = new MockHttpServletRequest("POST", "/api/v1/references/search/batch") {
            @Override public long getContentLengthLong() { return -1; }
        };
        request.setContent(new byte[256 * 1024 + 1]);
        var response = new MockHttpServletResponse();
        var called = new AtomicBoolean();

        new ReferenceBatchPayloadFilter(new ApiErrorWriter(new ObjectMapper())).doFilter(request, response,
                (input, output) -> called.set(true));

        assertThat(response.getStatus()).isEqualTo(413);
        assertThat(called).isFalse();
    }
}
