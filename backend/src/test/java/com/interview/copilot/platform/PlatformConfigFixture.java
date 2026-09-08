package com.interview.copilot.platform;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.admin.audit.AuditService;
import com.interview.copilot.ai.ProviderProperties;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

final class PlatformConfigFixture implements AutoCloseable {
    static final String MASTER_KEY = Base64.getEncoder().encodeToString(new byte[32]);
    final ObjectMapper json = new ObjectMapper();
    final ProviderProperties environment = new ProviderProperties();
    final PlatformConfigMapper mapper = mock(PlatformConfigMapper.class);
    final AuditService audit = mock(AuditService.class);
    final AtomicReference<PlatformConfigMapper.Row> row = new AtomicReference<>(new PlatformConfigMapper.Row(0, false, "{}"));
    final ValidatorFactory validation = Validation.buildDefaultValidatorFactory();
    final PlatformConfigService service;

    PlatformConfigFixture() {
        when(mapper.read()).thenAnswer(call -> row.get());
        when(mapper.publish(anyLong(), anyString())).thenAnswer(call -> {
            PlatformConfigMapper.Row old = row.get();
            if (old.version() != call.<Long>getArgument(0)) { return 0; }
            return row.compareAndSet(old, new PlatformConfigMapper.Row(old.version() + 1, true, call.getArgument(1))) ? 1 : 0;
        });
        service = service(MASTER_KEY);
    }

    PlatformConfigService service(String key) {
        return new PlatformConfigService(mapper, new PlatformConfigCodec(json, new PlatformSecretCipher(key)),
                new PlatformConfigValidator(validation.getValidator()), environment, audit);
    }

    static PlatformConfig config(long version, String key) {
        return new PlatformConfig(version,
                List.of(new PlatformConfig.Provider("primary", "回答服务", "llm", "https://provider.invalid/v1/chat/completions", true, false, key)),
                List.of(new PlatformConfig.Model("fast", "快速回答", "primary", "upstream-fast", true, 1000),
                        new PlatformConfig.Model("careful", "完整回答", "primary", "upstream-careful", true, 2000)),
                "fast", new PlatformConfig.Asr(false, "", ""), new PlatformConfig.Knowledge(false, "", ""));
    }

    static PlatformConfig empty(long version) {
        return new PlatformConfig(version, List.of(), List.of(), "",
                new PlatformConfig.Asr(false, "", ""), new PlatformConfig.Knowledge(false, "", ""));
    }

    @Override public void close() { validation.close(); }
}
