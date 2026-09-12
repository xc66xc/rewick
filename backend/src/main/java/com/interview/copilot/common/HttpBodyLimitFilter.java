package com.interview.copilot.common;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class HttpBodyLimitFilter extends OncePerRequestFilter {
    private static final int MAX_BODY_BYTES = 1048576;
    private static final Set<String> BODY_METHODS = Set.of("POST", "PUT", "PATCH");
    private final ApiErrorWriter errors;

    public HttpBodyLimitFilter(ApiErrorWriter errors) {
        this.errors = errors;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/v1/")
                || !BODY_METHODS.contains(request.getMethod());
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if ("POST".equals(request.getMethod())
                && "/api/v1/references".equals(request.getRequestURI())
                && request.getContentType() != null
                && request.getContentType().startsWith("multipart/form-data")) {
            if (request.getContentLengthLong() > 11L * MAX_BODY_BYTES) {
                reject(response);
                return;
            }
            // Servlet multipart limits enforce chunked requests without consuming the multipart
            // stream here.
            chain.doFilter(request, response);
            return;
        }
        int limit = request.getRequestURI().startsWith("/api/v1/session-records/") ? 5 * MAX_BODY_BYTES : MAX_BODY_BYTES;
        if (request.getContentLengthLong() > limit) {
            reject(response);
            return;
        }
        byte[] bytes = request.getInputStream().readNBytes(limit + 1);
        if (bytes.length > limit) {
            reject(response);
            return;
        }
        chain.doFilter(new BoundedRequest(request, bytes), response);
    }

    private void reject(HttpServletResponse response) throws IOException {
        errors.write(response, 413, "request_too_large", "请求正文超过接口容量限制。");
    }
}
