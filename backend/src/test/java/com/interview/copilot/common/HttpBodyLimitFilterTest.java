package com.interview.copilot.common;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.concurrent.atomic.AtomicBoolean;

public class HttpBodyLimitFilterTest {
    @Test
    void filter_multipartUpload_allowsDocumentBodyWithoutReadingStream() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/references");
        request.setContentType("multipart/form-data; boundary=fixture");
        request.setContent(new byte[2 * 1048576]);
        AtomicBoolean called = new AtomicBoolean();
        new HttpBodyLimitFilter(new ApiErrorWriter(new ObjectMapper()))
                .doFilter(
                        request,
                        new MockHttpServletResponse(),
                        (incoming, outgoing) -> called.set(true));
        assertThat(called).isTrue();
    }

    @Test
    void filter_multipartOtherRoute_doesNotBypassOrdinaryBodyLimit() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/answers");
        request.setContentType("multipart/form-data; boundary=fixture");
        request.setContent(new byte[2 * 1048576]);
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean called = new AtomicBoolean();
        new HttpBodyLimitFilter(new ApiErrorWriter(new ObjectMapper()))
                .doFilter(request, response, (incoming, outgoing) -> called.set(true));
        assertThat(response.getStatus()).isEqualTo(413);
        assertThat(called).isFalse();
    }

    @Test
    void filter_multipartUploadExceedingEnvelope_rejects() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/references");
        request.setContentType("multipart/form-data; boundary=fixture");
        request.setContent(new byte[11 * 1048576 + 1]);
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean called = new AtomicBoolean();
        new HttpBodyLimitFilter(new ApiErrorWriter(new ObjectMapper()))
                .doFilter(request, response, (incoming, outgoing) -> called.set(true));
        assertThat(response.getStatus()).isEqualTo(413);
        assertThat(called).isFalse();
    }

    @Test
    void filter_chunkedOversizeBody_rejectsBeforeController() throws Exception {
        MockHttpServletRequest request =
                new MockHttpServletRequest("POST", "/api/v1/answers") {
                    @Override
                    public long getContentLengthLong() {
                        return -1;
                    }
                };
        request.setContent(new byte[1048577]);
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean called = new AtomicBoolean();

        new HttpBodyLimitFilter(new ApiErrorWriter(new ObjectMapper()))
                .doFilter(request, response, (incoming, outgoing) -> called.set(true));

        assertThat(response.getStatus()).isEqualTo(413);
        assertThat(called).isFalse();
    }
}
