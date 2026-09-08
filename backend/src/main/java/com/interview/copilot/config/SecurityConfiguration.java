package com.interview.copilot.config;

import com.interview.copilot.auth.AuthService;
import com.interview.copilot.auth.BearerTokenFilter;
import com.interview.copilot.common.ApiErrorWriter;
import jakarta.servlet.DispatcherType;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
public class SecurityConfiguration {
    @Bean
    SecurityFilterChain security(HttpSecurity http, AuthService auth, ApiErrorWriter errors) throws Exception {
        http.csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .requestCache(cache -> cache.disable())
                .formLogin(form -> form.disable())
                .httpBasic(basic -> basic.disable())
                .logout(logout -> logout.disable())
                .authorizeHttpRequests(access -> access
                        .dispatcherTypeMatchers(DispatcherType.ASYNC, DispatcherType.ERROR).permitAll()
                        .requestMatchers(HttpMethod.GET, "/actuator/health").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/login").permitAll()
                        .requestMatchers("/api/v1/**").authenticated()
                        .anyRequest().denyAll())
                .exceptionHandling(handling -> handling
                        .authenticationEntryPoint((request, response, error) ->
                                errors.write(response, 401, "unauthorized", "请登录后再使用平台服务。"))
                        .accessDeniedHandler((request, response, error) ->
                                errors.write(response, 403, "forbidden", "无权访问此资源。")))
                .addFilterBefore(new BearerTokenFilter(auth, errors), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
