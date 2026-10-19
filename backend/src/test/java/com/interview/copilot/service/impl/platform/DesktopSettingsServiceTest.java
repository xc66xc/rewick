package com.interview.copilot.service.impl.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.common.platform.PlatformConfigFixture;
import com.interview.copilot.entity.platform.DesktopSettingsEntity;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.mapper.platform.DesktopSettingsMapper;
import com.interview.copilot.mapper.platform.PlatformConfigMapper;
import com.interview.copilot.model.platform.PlatformPolicy;
import com.interview.copilot.model.platform.PlatformSnapshot;
import com.interview.copilot.response.platform.DesktopSettingsResponse;
import com.interview.copilot.service.audit.AuditService;
import com.interview.copilot.service.platform.PlatformRuntimeService;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;

import java.util.Map;

/**
 * @author Carl Wang
 * @date 2026-09-13
 * @description 验证桌面默认配置及高级设置授权边界。
 */
class DesktopSettingsServiceTest {
    private final DesktopSettingsMapper mapper = mock(DesktopSettingsMapper.class);
    private final PlatformConfigMapper config = mock(PlatformConfigMapper.class);
    private final PlatformRuntimeService runtime = mock(PlatformRuntimeService.class);
    private final AuditService audit = mock(AuditService.class);
    private final DesktopSettingsServiceImpl service =
            new DesktopSettingsServiceImpl(mapper, config, runtime, audit);
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void llm_ordinaryMissingSelections_injectsPlatformDefaultsWithoutMutatingInput() {
        when(mapper.read()).thenReturn(defaults());
        var input = json.createObjectNode().put("stream", true);

        var output = service.llm(7, input);

        assertThat(output.path("model").asText()).isEqualTo("fast");
        assertThat(output.path("temperature").asDouble()).isEqualTo(0.7);
        assertThat(output.path("stream").asBoolean()).isTrue();
        assertThat(input.has("model")).isFalse();
    }

    @Test
    void llm_matchingExplicitDefaults_acceptsRequest() {
        when(mapper.read()).thenReturn(defaults());
        var input = json.createObjectNode().put("model", "fast").put("temperature", 0.7);

        assertThat(service.llm(7, input)).isEqualTo(input);
    }

    @ParameterizedTest
    @ValueSource(strings = {"model", "temperature", "invalid-temperature"})
    void llm_ordinaryOverride_rejectsForbidden(String field) {
        when(mapper.read()).thenReturn(defaults());
        var input = json.createObjectNode();
        switch (field) {
            case "model" -> input.put("model", "careful");
            case "temperature" -> input.put("temperature", 0.9);
            default -> input.put("temperature", "0.7");
        }

        assertThatThrownBy(() -> service.llm(7, input))
                .isInstanceOfSatisfying(
                        ApiException.class,
                        error -> assertThat(error.status()).isEqualTo(HttpStatus.FORBIDDEN));
    }

    @Test
    void llm_granted_preservesSelectedModelAndTemperature() {
        when(mapper.permitted(7)).thenReturn(true);
        var input = json.createObjectNode().put("model", "careful").put("temperature", 1.2);

        assertThat(service.llm(7, input)).isEqualTo(input).isNotSameAs(input);
        assertThat(service.asr(7, "custom-asr")).isEqualTo("custom-asr");
        verify(mapper, never()).read();
    }

    @Test
    void asr_ordinary_usesDefaultAndRejectsAnotherService() {
        when(mapper.read()).thenReturn(defaults());

        assertThat(service.asr(7, null)).isEqualTo("speech");
        assertThat(service.asr(7, "speech")).isEqualTo("speech");
        assertThatThrownBy(() -> service.asr(7, "other"))
                .isInstanceOfSatisfying(
                        ApiException.class,
                        error -> assertThat(error.status()).isEqualTo(HttpStatus.FORBIDDEN));
    }

    @Test
    void asr_missingDefault_reportsConfigurationUnavailable() {
        when(mapper.read()).thenReturn(new DesktopSettingsEntity(0, "", 0.7, ""));

        assertThatThrownBy(() -> service.asr(7, null))
                .isInstanceOfSatisfying(
                        ApiException.class,
                        error ->
                                assertThat(error.status())
                                        .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        assertThatThrownBy(() -> service.llm(7, json.createObjectNode()))
                .isInstanceOfSatisfying(
                        ApiException.class,
                        error -> assertThat(error.code()).isEqualTo("DESKTOP_DEFAULT_REQUIRED"));
    }

    @Test
    void save_unavailableModel_rejectsBeforeWriting() {
        when(runtime.snapshot()).thenReturn(snapshot());
        var input = new DesktopSettingsResponse(0, "disabled", 0.7, "");

        assertThatThrownBy(() -> service.save(1, input))
                .isInstanceOfSatisfying(
                        ApiException.class,
                        error -> assertThat(error.code()).isEqualTo("DESKTOP_DEFAULT_UNAVAILABLE"));
        verify(mapper, never()).save(any());
    }

    @Test
    void save_staleVersion_reportsConflictAndDoesNotAudit() {
        when(runtime.snapshot()).thenReturn(snapshot());
        var input = new DesktopSettingsResponse(0, "fast", 0.7, "");

        assertThatThrownBy(() -> service.save(1, input))
                .isInstanceOfSatisfying(
                        ApiException.class,
                        error -> assertThat(error.status()).isEqualTo(HttpStatus.CONFLICT));
        verify(audit, never()).record(any(Long.class), any(), any());
    }

    @Test
    void save_valid_serializesWithPlatformChangesAndReturnsNewVersion() {
        when(runtime.snapshot()).thenReturn(snapshot());
        when(mapper.save(any())).thenReturn(1);
        when(mapper.read()).thenReturn(new DesktopSettingsEntity(1, "fast", 0.7, ""));
        var input = new DesktopSettingsResponse(0, "fast", 0.7, "");

        assertThat(service.save(1, input).version()).isEqualTo(1);
        var order = inOrder(config, runtime, mapper);
        order.verify(config).lock();
        order.verify(runtime).snapshot();
        order.verify(mapper).save(any());
        verify(audit).record(1, "desktop.defaults.update", "version:1");
    }

    @Test
    void permission_missingUser_reportsNotFound() {
        assertThatThrownBy(() -> service.permission(1, 7, true))
                .isInstanceOfSatisfying(
                        ApiException.class,
                        error -> assertThat(error.status()).isEqualTo(HttpStatus.NOT_FOUND));
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void permission_existingUser_recordsGrantOrRevocation(boolean enabled) {
        when(mapper.permission(7, enabled)).thenReturn(1);

        service.permission(1, 7, enabled);

        verify(audit).record(1, "desktop.permission.update", "user:7,enabled:" + enabled);
    }

    private DesktopSettingsEntity defaults() {
        return new DesktopSettingsEntity(0, "fast", 0.7, "speech");
    }

    private PlatformSnapshot snapshot() {
        return new PlatformSnapshot(
                PlatformConfigFixture.config(0, "test-key"),
                Map.of("primary", "test-key"),
                new PlatformPolicy(2, 30, 180, 3600));
    }
}
