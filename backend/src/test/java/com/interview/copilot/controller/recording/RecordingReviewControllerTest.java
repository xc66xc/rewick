package com.interview.copilot.controller.recording;

import com.interview.copilot.exception.ApiException;
import com.interview.copilot.request.recording.RecordingReviewRequest;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.recording.RecordingReviewService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class RecordingReviewControllerTest {
    private final RecordingReviewService service = mock(RecordingReviewService.class);
    private final RecordingReviewController controller = new RecordingReviewController(service);

    @AfterEach
    void clearAuthentication() { SecurityContextHolder.clearContext(); }

    @Test
    void summarize_anonymous_rejected() {
        assertThatThrownBy(() -> controller.summarize(null, new RecordingReviewRequest("对话")))
                .isInstanceOf(ApiException.class);
        verifyNoInteractions(service);
    }

    @Test
    void summarize_authenticated_scopesTextToUser() {
        when(service.summarize(7L, "面试对话")).thenReturn("# 复盘");
        assertThat(controller.summarize(new UserPrincipal(7, "test"),
                new RecordingReviewRequest("面试对话")).markdown()).isEqualTo("# 复盘");
    }

    @Test
    void transcribe_authenticated_hasNoAudioUploadHandler() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(new UserPrincipal(7, "test"), null, java.util.List.of()));
        var mvc = MockMvcBuilders.standaloneSetup(controller)
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver()).build();

        mvc.perform(post("/api/v1/recording-reviews/transcribe")
                .contentType(MediaType.APPLICATION_OCTET_STREAM).content(new byte[3200]))
                .andExpect(status().isNotFound());
        verifyNoInteractions(service);
    }
}
