package com.interview.copilot.controller.screenshots;

import com.interview.copilot.exception.ApiException;
import com.interview.copilot.exception.ApiExceptionHandler;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.operations.OperationsService;
import com.interview.copilot.service.screenshots.ScreenshotService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import reactor.core.publisher.Mono;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ScreenshotControllerTest {
    private final ScreenshotService service = mock(ScreenshotService.class);
    private final OperationsService operations = mock(OperationsService.class);
    private final org.springframework.test.web.servlet.MockMvc mvc = MockMvcBuilders
            .standaloneSetup(new ScreenshotController(service, operations))
            .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
            .setControllerAdvice(new ApiExceptionHandler()).build();

    @AfterEach
    void clearAuthentication() { SecurityContextHolder.clearContext(); }

    @Test
    void recognize_anonymous_rejectsWithoutProviderOrOperations() throws Exception {
        mvc.perform(post("/api/v1/screenshots/recognize").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"image\":\"synthetic\"}"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(service, operations);
    }

    @Test
    void recognize_authenticated_scopesRequestAndReturnsTextOnly() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new UserPrincipal(7, "synthetic"), null, java.util.List.of()));
        when(service.recognize(eq(7L), eq("shot-request"), eq("synthetic"), isNull()))
                .thenReturn(Mono.just("算法题正文"));
        var pending = mvc.perform(post("/api/v1/screenshots/recognize").contentType(MediaType.APPLICATION_JSON)
                        .header("X-Request-Id", "shot-request").content("{\"image\":\"synthetic\"}"))
                .andExpect(request().asyncStarted()).andReturn();
        mvc.perform(asyncDispatch(pending)).andExpect(status().isOk())
                .andExpect(jsonPath("$.question").value("算法题正文"))
                .andExpect(jsonPath("$.image").doesNotExist());
        verify(service).recognize(7L, "shot-request", "synthetic", null);
    }
}
