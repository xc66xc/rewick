package com.interview.copilot.common.platform;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.converter.platform.PlatformConfigCodec;
import com.interview.copilot.mapper.platform.PlatformConfigMapper;
import com.interview.copilot.model.platform.PlatformConfig;
import com.interview.copilot.security.platform.PlatformSecretCipher;
import com.interview.copilot.service.audit.AuditService;
import com.interview.copilot.service.impl.platform.PlatformConfigServiceImpl;
import com.interview.copilot.service.platform.PlatformConfigService;
import com.interview.copilot.validation.platform.PlatformConfigValidator;

import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;

import java.util.Base64;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

public final class PlatformConfigFixture implements AutoCloseable {
    public static final String MASTER_KEY = Base64.getEncoder().encodeToString(new byte[32]);
    public final ObjectMapper json = new ObjectMapper();
    public final ProviderProperties environment = new ProviderProperties();
    public final PlatformConfigMapper mapper = mock(PlatformConfigMapper.class);
    public final AuditService audit = mock(AuditService.class);
    public final AtomicReference<PlatformConfigMapper.Row> row =
            new AtomicReference<>(new PlatformConfigMapper.Row(0, false, "{}"));
    public final ValidatorFactory validation = Validation.buildDefaultValidatorFactory();
    public final PlatformConfigService service;

    public PlatformConfigFixture() {
        when(mapper.read()).thenAnswer(call -> row.get());
        when(mapper.publish(anyLong(), anyString()))
                .thenAnswer(
                        call -> {
                            PlatformConfigMapper.Row old = row.get();
                            if (old.version() != call.<Long>getArgument(0)) {
                                return 0;
                            }
                            return row.compareAndSet(
                                            old,
                                            new PlatformConfigMapper.Row(
                                                    old.version() + 1, true, call.getArgument(1)))
                                    ? 1
                                    : 0;
                        });
        service = service(MASTER_KEY);
    }

    public PlatformConfigService service(String key) {
        return new PlatformConfigServiceImpl(
                mapper,
                new PlatformConfigCodec(json, new PlatformSecretCipher(key)),
                new PlatformConfigValidator(validation.getValidator()),
                environment,
                audit);
    }

    public static PlatformConfig config(long version, String key) {
        return new PlatformConfig(
                version,
                List.of(
                        new PlatformConfig.Provider(
                                "primary",
                                "回答服务",
                                "llm",
                                "https://provider.invalid/v1/chat/completions",
                                true,
                                false,
                                key)),
                List.of(
                        new PlatformConfig.Model(
                                "fast", "快速回答", "primary", "upstream-fast", true, 1000),
                        new PlatformConfig.Model(
                                "careful", "完整回答", "primary", "upstream-careful", true, 2000)),
                "fast",
                new PlatformConfig.Asr(false, "", ""),
                new PlatformConfig.Knowledge(false, "", ""));
    }

    public static PlatformConfig empty(long version) {
        return new PlatformConfig(
                version,
                List.of(),
                List.of(),
                "",
                new PlatformConfig.Asr(false, "", ""),
                new PlatformConfig.Knowledge(false, "", ""));
    }

    @Override
    public void close() {
        validation.close();
    }
}
