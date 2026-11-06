package com.interview.copilot.common;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.concurrent.atomic.AtomicBoolean;

public class HttpBodyLimitFilterTest {
    @Test
    void filter_sessionRecordAboveOldLimit_acceptsEnvelope() throws Exception {
        var request = new MockHttpServletRequest("POST", "/api/v1/session-records/record");
        request.setContent(new byte[21 * 1048576]);
        var called = new AtomicBoolean();
        new HttpBodyLimitFilter(new ApiErrorWriter(new ObjectMapper())).doFilter(request,
                new MockHttpServletResponse(), (incoming, outgoing) -> {
                    assertThat(incoming.getInputStream().readAllBytes()).hasSize(21 * 1048576);
                    called.set(true);
                });
        assertThat(called).isTrue();
    }

    @Test
    void filter_sessionRecordOverHardLimit_rejectsBeforeReading() throws Exception {
        var request = new MockHttpServletRequest("POST", "/api/v1/session-records/record") {
            @Override public long getContentLengthLong() { return 51L * 1048576 + 1; }
            @Override public jakarta.servlet.ServletInputStream getInputStream() {
                throw new AssertionError("Must reject before reading");
            }
        };
        var response = new MockHttpServletResponse();
        new HttpBodyLimitFilter(new ApiErrorWriter(new ObjectMapper())).doFilter(request, response,
                (incoming, outgoing) -> { throw new AssertionError("Must not reach controller"); });
        assertThat(response.getStatus()).isEqualTo(413);
    }

    @Test
    void filter_screenshotWithinEnvelope_acceptsImageBodyLargerThanOrdinaryLimit() throws Exception {
        var request = new MockHttpServletRequest("POST", "/api/v1/screenshots/recognize");
        request.setContent(new byte[2 * 1048576]);
        var response = new MockHttpServletResponse();
        var called = new AtomicBoolean();
        new HttpBodyLimitFilter(new ApiErrorWriter(new ObjectMapper())).doFilter(request, response,
                (incoming, outgoing) -> {
                    assertThat(incoming.getInputStream().readAllBytes()).hasSize(2 * 1048576);
                    called.set(true);
                });
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(called).isTrue();
    }

    @Test
    void filter_screenshotContentLengthOverLimit_rejectsBeforeReading() throws Exception {
        var request = new MockHttpServletRequest("POST", "/api/v1/screenshots/recognize") {
            @Override public long getContentLengthLong() { return 8L * 1048576 + 1025; }
            @Override public jakarta.servlet.ServletInputStream getInputStream() {
                throw new AssertionError("Must reject before reading");
            }
        };
        var response = new MockHttpServletResponse();
        new HttpBodyLimitFilter(new ApiErrorWriter(new ObjectMapper())).doFilter(request, response,
                (incoming, outgoing) -> { throw new AssertionError("Must not reach controller"); });
        assertThat(response.getStatus()).isEqualTo(413);
    }

    @Test
    void filter_chunkedScreenshotOverLimit_returns413WithoutCallingController() throws Exception {
        var request = new MockHttpServletRequest("POST", "/api/v1/screenshots/recognize") {
            @Override public long getContentLengthLong() { return -1; }
        };
        request.setContent(new byte[8 * 1048576 + 1025]);
        var response = new MockHttpServletResponse();
        new HttpBodyLimitFilter(new ApiErrorWriter(new ObjectMapper())).doFilter(request, response,
                (incoming, outgoing) -> { throw new AssertionError("Must not reach controller"); });
        assertThat(response.getStatus()).isEqualTo(413);
        assertThat(response.getContentAsString()).contains("request_too_large");
    }

    @Test
    void filter_screenshotSiblingPath_doesNotInheritLargerLimit() throws Exception {
        var request = new MockHttpServletRequest("POST", "/api/v1/screenshots/other");
        request.setContent(new byte[1048577]);
        var response = new MockHttpServletResponse();
        new HttpBodyLimitFilter(new ApiErrorWriter(new ObjectMapper())).doFilter(request, response,
                (incoming, outgoing) -> { throw new AssertionError("Must not reach controller"); });
        assertThat(response.getStatus()).isEqualTo(413);
    }

    @Test
    void filter_installerUsesSeparateLimitWithoutBufferingTheFile() throws Exception {
        MockHttpServletRequest request =
                new MockHttpServletRequest(
                        "POST", "/api/v1/admin/client-downloads/macos-arm64/upload") {
                    @Override
                    public long getContentLengthLong() {
                        return 100L * 1048576;
                    }

                    @Override
                    public jakarta.servlet.ServletInputStream getInputStream() {
                        throw new AssertionError("Must not buffer installer");
                    }
                };
        request.setContentType("multipart/form-data; boundary=fixture");
        AtomicBoolean called = new AtomicBoolean();
        new HttpBodyLimitFilter(new ApiErrorWriter(new ObjectMapper()))
                .doFilter(
                        request,
                        new MockHttpServletResponse(),
                        (incoming, outgoing) -> called.set(true));
        assertThat(called).isTrue();
    }

    @Test
    void filter_installerOverLimitIsRejectedBeforeReading() throws Exception {
        MockHttpServletRequest request =
                new MockHttpServletRequest(
                        "POST", "/api/v1/admin/client-downloads/windows-x64/upload") {
                    @Override
                    public long getContentLengthLong() {
                        return 502L * 1048576;
                    }
                };
        request.setContentType("multipart/form-data; boundary=fixture");
        MockHttpServletResponse response = new MockHttpServletResponse();
        new HttpBodyLimitFilter(new ApiErrorWriter(new ObjectMapper()))
                .doFilter(
                        request,
                        response,
                        (incoming, outgoing) -> {
                            throw new AssertionError("Must reject oversized upload");
                        });
        assertThat(response.getStatus()).isEqualTo(413);
    }

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
