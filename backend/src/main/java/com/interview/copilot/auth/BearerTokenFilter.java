package com.interview.copilot.auth;

import com.interview.copilot.common.ApiErrorWriter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

public class BearerTokenFilter extends OncePerRequestFilter {
    private static final Logger LOGGER = LoggerFactory.getLogger(BearerTokenFilter.class);
    private final AuthService auth;
    private final ApiErrorWriter errors;

    public BearerTokenFilter(AuthService auth, ApiErrorWriter errors) {
        this.auth = auth;
        this.errors = errors;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        try {
            if (header != null && header.startsWith("Bearer ")) {
                auth.authenticate(header.substring(7)).ifPresent(principal -> SecurityContextHolder.getContext()
                        .setAuthentication(new UsernamePasswordAuthenticationToken(principal, null, List.of())));
            }
        } catch (DataAccessException error) {
            LOGGER.error("Authentication storage unavailable; exceptionType={}", error.getClass().getName());
            errors.write(response, 503, "authentication_unavailable", "登录服务暂时不可用。");
            return;
        }
        chain.doFilter(request, response);
    }
}
