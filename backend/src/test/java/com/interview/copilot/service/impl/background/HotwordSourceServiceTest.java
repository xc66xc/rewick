package com.interview.copilot.service.impl.background;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.entity.background.BackgroundEntity;
import com.interview.copilot.mapper.background.BackgroundMapper;
import com.interview.copilot.mapper.background.HotwordSourceMapper;
import com.interview.copilot.mapper.references.ReferenceMapper;
import com.interview.copilot.model.background.BackgroundKind;
import com.interview.copilot.exception.ApiException;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

class HotwordSourceServiceTest {
    private final BackgroundMapper backgrounds = mock(BackgroundMapper.class);
    private final ReferenceMapper references = mock(ReferenceMapper.class);
    private final HotwordSourceServiceImpl service = new HotwordSourceServiceImpl(
            backgrounds, references, new ObjectMapper(), mock(HotwordSourceMapper.class));
    private final String id = "11111111-1111-4111-8111-111111111111";

    @Test
    void read_missingOrOtherTenant_rejects() {
        assertThatThrownBy(() -> service.read(7, id, null, List.of())).isInstanceOf(ApiException.class);
        verify(backgrounds).find(7, BackgroundKind.resumes, id);
    }

    @Test
    void read_largeResume_boundsPrompt() {
        when(backgrounds.find(7, BackgroundKind.resumes, id)).thenReturn(new BackgroundEntity(
                id, "{\"text\":\"" + "a".repeat(20000) + "\"}", 1, id, false, null, null));
        assertThat(service.read(7, id, null, List.of())).hasSizeLessThanOrEqualTo(12000);
    }

    @Test
    void read_emptySelection_rejects() {
        assertThatThrownBy(() -> service.read(7, null, null, List.of())).isInstanceOf(ApiException.class);
    }
}
