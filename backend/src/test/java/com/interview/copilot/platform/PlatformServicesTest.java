package com.interview.copilot.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.auth.UserPrincipal;
import com.interview.copilot.common.ApiException;
import com.interview.copilot.config.PlatformController;
import com.interview.copilot.usage.UserLimitsService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class PlatformServicesTest {
    @AfterEach void clearSecurityContext() { SecurityContextHolder.clearContext(); }

    @Test void platform_activeBindings_exposesOnlyPublicServiceChoicesAndPreservesExistingFields() throws Exception {
        PlatformSnapshot snapshot = snapshot(Availability.ENABLED);
        UserLimitsService limits = mock(UserLimitsService.class);
        when(limits.effective(1)).thenReturn(new UserLimitsService.EffectiveLimits(100, 300, 3600));
        UserPrincipal user = new UserPrincipal(1, "fixture-user", "USER", "fixture@example.invalid");
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(user, null, List.of()));
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new PlatformController(() -> snapshot, limits))
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver()).build();

        String body = mvc.perform(get("/api/v1/platform")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode response = new ObjectMapper().readTree(body);

        assertThat(response.at("/services/asr")).hasSize(1);
        assertThat(response.at("/services/asr/0/id").asText()).isEqualTo("asr-bound");
        assertThat(response.at("/services/asr/0/name").asText()).isEqualTo("Selected ASR");
        assertThat(response.at("/services/knowledge/0/id").asText()).isEqualTo("knowledge-bound");
        assertThat(response.at("/services/embedding").isArray()).isTrue();
        assertThat(response.at("/services/embedding")).isEmpty();
        assertThat(response.at("/models/available/0/id").asText()).isEqualTo("answer-model");
        assertThat(response.at("/models/llm").asText()).isEqualTo("answer-model");
        assertThat(response.at("/models/asr").asText()).isEqualTo("transcriber-v1");
        assertThat(response.at("/user/email").asText()).isEqualTo("fixture@example.invalid");
        assertThat(body).doesNotContain("asr-unbound", "knowledge-unbound", "fixture-secret", "provider.invalid", "fixture-agent", "apiKey", "providerId");
    }

    @ParameterizedTest
    @EnumSource(value = Availability.class, names = {"PROVIDER_DISABLED", "SERVICE_DISABLED", "KEY_MISSING", "BINDING_MISSING"})
    void services_unavailableBinding_neverListsOtherUnboundProviders(Availability availability) {
        PlatformSnapshot snapshot = snapshot(availability);

        assertThat(snapshot.availableAsrServices()).isEmpty();
        assertThat(snapshot.availableKnowledgeServices()).isEmpty();
        assertThatThrownBy(() -> snapshot.asr("asr-bound")).isInstanceOf(ApiException.class)
                .extracting("code").isEqualTo("SERVICE_UNAVAILABLE");
    }

    @Test void services_explicitUnboundOrStaleSelection_rejectsInsteadOfUsingBoundReplacement() {
        PlatformSnapshot snapshot = snapshot(Availability.ENABLED);

        assertThatThrownBy(() -> snapshot.asr("asr-unbound")).isInstanceOf(ApiException.class)
                .extracting("code").isEqualTo("SERVICE_UNAVAILABLE");
        assertThatThrownBy(() -> snapshot.knowledge("retired-knowledge")).isInstanceOf(ApiException.class)
                .extracting("code").isEqualTo("SERVICE_UNAVAILABLE");
    }

    @Test void services_absentSelection_remainsCompatibleWithExistingClients() {
        PlatformSnapshot snapshot = snapshot(Availability.ENABLED);

        assertThat(snapshot.asr(null).getApiKey()).isEqualTo(snapshot.asr("asr-bound").getApiKey());
        assertThat(snapshot.knowledge(null).getAgentId()).isEqualTo(snapshot.knowledge("knowledge-bound").getAgentId());
    }

    private PlatformSnapshot snapshot(Availability availability) {
        boolean providerEnabled = availability != Availability.PROVIDER_DISABLED;
        boolean serviceEnabled = availability != Availability.SERVICE_DISABLED;
        String binding = availability == Availability.BINDING_MISSING ? "" : "configured";
        List<PlatformConfig.Provider> providers = List.of(provider("asr-bound", "Selected ASR", "asr", providerEnabled),
                provider("asr-unbound", "Unused ASR", "asr", true), provider("knowledge-bound", "Selected knowledge", "knowledge", providerEnabled),
                provider("knowledge-unbound", "Unused knowledge", "knowledge", true), provider("answer", "Answers", "llm", true));
        String key = availability == Availability.KEY_MISSING ? "" : "fixture-secret";
        Map<String, String> keys = Map.of("asr-bound", key, "knowledge-bound", key,
                "asr-unbound", "unbound-secret", "knowledge-unbound", "unbound-secret", "answer", "answer-secret");
        PlatformConfig config = new PlatformConfig(1, providers,
                List.of(new PlatformConfig.Model("answer-model", "Answer model", "answer", "actual-answer", true, 1000)), "answer-model",
                new PlatformConfig.Asr(serviceEnabled, "asr-bound", binding.isEmpty() ? "" : "transcriber-v1"),
                new PlatformConfig.Knowledge(serviceEnabled, "knowledge-bound", binding.isEmpty() ? "" : "fixture-agent"));
        return new PlatformSnapshot(config, keys, new PlatformPolicy(8, 30, 180, 5, 3600));
    }

    private PlatformConfig.Provider provider(String id, String name, String kind, boolean enabled) {
        String protocol = kind.equals("asr") ? "wss" : "https";
        return new PlatformConfig.Provider(id, name, kind, protocol + "://provider.invalid/" + id, enabled, false, null);
    }

    private enum Availability { ENABLED, PROVIDER_DISABLED, SERVICE_DISABLED, KEY_MISSING, BINDING_MISSING }
}
