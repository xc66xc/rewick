package com.interview.copilot.service.impl.history;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.entity.history.SessionRecordEntity;
import com.interview.copilot.mapper.history.SessionRecordMapper;
import com.interview.copilot.mapper.platform.DesktopSettingsMapper;
import com.interview.copilot.service.auth.SessionGuardService;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionRecordServiceTest {
    private final SessionRecordMapper mapper = mock(SessionRecordMapper.class);
    private final SessionRecordServiceImpl service = new SessionRecordServiceImpl(mapper, mock(SessionGuardService.class),
            new ObjectMapper(), mock(DesktopSettingsMapper.class));
    private final SessionRecordEntity row = new SessionRecordEntity(1, "record", 7, "mutation", """
            {"id":"record","answers":[{"question":"原话","text":"完整回答","questionRewrite":{"resultFormat":"questions-v1","questions":[]},
              "retrieval":{"queries":[],"excerpts":[]}}]}
            """, false);

    @Test
    void read_declaredFormat_returnsFullSnapshotWhileLegacyReaderReceivesProjection() {
        when(mapper.find(7, "record")).thenReturn(row);

        var modern = service.read(7, "record", "questions-v1");
        var legacy = service.read(7, "record");

        assertThat(modern.record().path("answers").path(0).has("questionRewrite")).isTrue();
        assertThat(legacy.record().path("answers").path(0).has("questionRewrite")).isFalse();
        assertThat(legacy.record().path("answers").path(0).path("text").asText()).isEqualTo("完整回答");
        assertThat(legacy.version()).isEqualTo(7);
    }

    @Test
    void page_declaredFormat_usesSameCompatibilityViewAndTenantMapper() {
        when(mapper.page(7, 99)).thenReturn(List.of(row));

        assertThat(service.page(7, 99).records().getFirst().path("answers").path(0).has("questionRewrite")).isFalse();
        assertThat(service.page(7, 99, "questions-v1").records().getFirst().path("answers").path(0).has("questionRewrite")).isTrue();
        verify(mapper, org.mockito.Mockito.times(2)).page(7, 99);
    }
}
