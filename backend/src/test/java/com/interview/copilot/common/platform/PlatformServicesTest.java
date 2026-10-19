package com.interview.copilot.common.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.config.PlatformLimitsProperties;
import com.interview.copilot.controller.platform.PlatformController;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.model.platform.PlatformConfig;
import com.interview.copilot.model.platform.PlatformPolicy;
import com.interview.copilot.model.platform.PlatformSnapshot;
import com.interview.copilot.security.auth.UserPrincipal;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;

public class PlatformServicesTest {
    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void platform_activeBindings_exposesOnlyPublicServiceChoicesAndPreservesExistingFields()
            throws Exception {
        PlatformSnapshot snapshot = snapshot(Availability.ENABLED);
        var limits = new PlatformLimitsProperties(3600);
        UserPrincipal user =
                new UserPrincipal(1, "fixture-user", "USER", "fixture@example.invalid");
        SecurityContextHolder.getContext()
                .setAuthentication(new UsernamePasswordAuthenticationToken(user, null, List.of()));
        var desktop = DesktopSettingsFixture.advanced();
        org.mockito.Mockito.when(desktop.get()).thenReturn(
                new com.interview.copilot.response.platform.DesktopSettingsResponse(
                        1, "answer-model", 0.7, "asr-bound"));
        MockMvc mvc =
                MockMvcBuilders.standaloneSetup(
                                new PlatformController(
                                        new com.interview.copilot.service.impl.platform
                                                .PlatformCatalogServiceImpl(
                                                () -> snapshot,
                                                limits,
                                                desktop)))
                        .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                        .build();

        String body =
                mvc.perform(get("/api/v1/platform"))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        JsonNode response = new ObjectMapper().readTree(body);

        assertThat(response.at("/services/asr")).hasSize(1);
        assertThat(response.at("/services/asr/0/id").asText()).isEqualTo("asr-bound");
        assertThat(response.at("/services/asr/0/name").asText()).isEqualTo("Selected ASR");
        assertThat(response.path("services").properties()).extracting(Map.Entry::getKey)
                .containsExactly("asr");
        assertThat(response.path("capabilities").properties()).extracting(Map.Entry::getKey)
                .containsExactlyInAnyOrder("llm", "asr");
        assertThat(response.path("desktopDefaults").properties()).extracting(Map.Entry::getKey)
                .containsExactlyInAnyOrder("version", "llmModelId", "temperature", "asrServiceId");
        assertThat(response.at("/services/embedding").isMissingNode()).isTrue();
        assertThat(response.at("/models/available/0/id").asText()).isEqualTo("answer-model");
        assertThat(response.at("/models/llm").asText()).isEqualTo("answer-model");
        assertThat(response.at("/models/asr").asText()).isEqualTo("transcriber-v1");
        assertThat(response.at("/user/email").asText()).isEqualTo("fixture@example.invalid");
        assertThat(body)
                .doesNotContain(
                        "asr-unbound",
                        "fixture-secret",
                        "provider.invalid",
                        "apiKey",
                        "providerId");
    }

    @ParameterizedTest
    @EnumSource(
            value = Availability.class,
            names = {"PROVIDER_DISABLED", "SERVICE_DISABLED", "KEY_MISSING", "BINDING_MISSING"})
    void services_unavailableBinding_neverListsOtherUnboundProviders(Availability availability) {
        PlatformSnapshot snapshot = snapshot(availability);

        assertThat(snapshot.availableAsrServices()).isEmpty();
        assertThatThrownBy(() -> snapshot.asr("asr-bound"))
                .isInstanceOf(ApiException.class)
                .extracting("code")
                .isEqualTo("SERVICE_UNAVAILABLE");
    }

    @Test
    void services_explicitUnboundOrStaleSelection_rejectsInsteadOfUsingBoundReplacement() {
        PlatformSnapshot snapshot = snapshot(Availability.ENABLED);

        assertThatThrownBy(() -> snapshot.asr("asr-unbound"))
                .isInstanceOf(ApiException.class)
                .extracting("code")
                .isEqualTo("SERVICE_UNAVAILABLE");
    }

    @Test
    void services_absentSelection_remainsCompatibleWithExistingClients() {
        PlatformSnapshot snapshot = snapshot(Availability.ENABLED);

        assertThat(snapshot.asr(null).getApiKey()).isEqualTo(snapshot.asr("asr-bound").getApiKey());
    }

    private PlatformSnapshot snapshot(Availability availability) {
        boolean providerEnabled = availability != Availability.PROVIDER_DISABLED;
        boolean serviceEnabled = availability != Availability.SERVICE_DISABLED;
        String binding = availability == Availability.BINDING_MISSING ? "" : "configured";
        List<PlatformConfig.Provider> providers =
                List.of(
                        provider("asr-bound", "Selected ASR", "asr", providerEnabled),
                        provider("asr-unbound", "Unused ASR", "asr", true),
                        provider("answer", "Answers", "llm", true));
        String key = availability == Availability.KEY_MISSING ? "" : "fixture-secret";
        Map<String, String> keys =
                Map.of(
                        "asr-bound",
                        key,
                        "asr-unbound",
                        "unbound-secret",
                        "answer",
                        "answer-secret");
        PlatformConfig config =
                new PlatformConfig(
                        1,
                        providers,
                        List.of(
                                new PlatformConfig.Model(
                                        "answer-model",
                                        "Answer model",
                                        "answer",
                                        "actual-answer",
                                        true,
                                        1000)),
                        "answer-model",
                        new PlatformConfig.Asr(
                                serviceEnabled,
                                "asr-bound",
                                binding.isEmpty() ? "" : "transcriber-v1"));
        return new PlatformSnapshot(config, keys, new PlatformPolicy(8, 30, 180, 3600));
    }

    private PlatformConfig.Provider provider(String id, String name, String kind, boolean enabled) {
        String protocol = kind.equals("asr") ? "wss" : "https";
        return new PlatformConfig.Provider(
                id, name, kind, protocol + "://provider.invalid/" + id, enabled, false, null);
    }

    private enum Availability {
        ENABLED,
        PROVIDER_DISABLED,
        SERVICE_DISABLED,
        KEY_MISSING,
        BINDING_MISSING
    }
}
