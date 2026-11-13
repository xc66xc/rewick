package com.interview.copilot.security.references;

import com.interview.copilot.common.ApiErrorWriter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.ByteArrayInputStream;
import java.io.IOException;

/** Reject oversized/chunked JSON before allocating the batch request DTO. */
@Component
public final class ReferenceBatchPayloadFilter extends OncePerRequestFilter {
    private static final int MAX_BYTES = 256 * 1024;
    private final ApiErrorWriter errors;

    public ReferenceBatchPayloadFilter(ApiErrorWriter errors) { this.errors = errors; }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equals(request.getMethod()) || !"/api/v1/references/search/batch".equals(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        if (request.getContentLengthLong() > MAX_BYTES) {
            reject(response);
            return;
        }
        byte[] body = request.getInputStream().readNBytes(MAX_BYTES + 1);
        if (body.length > MAX_BYTES) {
            reject(response);
            return;
        }
        chain.doFilter(wrapped(request, body), response);
    }

    private HttpServletRequest wrapped(HttpServletRequest request, byte[] body) {
        return new HttpServletRequestWrapper(request) {
            private final ByteArrayInputStream bytes = new ByteArrayInputStream(body);
            @Override public ServletInputStream getInputStream() {
                return new ServletInputStream() {
                    @Override public int read() { return bytes.read(); }
                    @Override public int read(byte[] buffer, int offset, int length) { return bytes.read(buffer, offset, length); }
                    @Override public boolean isFinished() { return bytes.available() == 0; }
                    @Override public boolean isReady() { return true; }
                    @Override public void setReadListener(ReadListener listener) { throw new IllegalStateException("Batch bodies are read synchronously"); }
                };
            }
        };
    }

    private void reject(HttpServletResponse response) throws IOException {
        errors.write(response, 413, "REFERENCE_BATCH_TOO_LARGE", "资料批次请求不能超过256 KiB。");
    }
}
