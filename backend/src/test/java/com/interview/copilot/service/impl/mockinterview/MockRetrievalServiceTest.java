package com.interview.copilot.service.impl.mockinterview;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.response.references.ReferenceRetrievalResponse;
import com.interview.copilot.service.references.ReferenceHybridService;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class MockRetrievalServiceTest {
    private final ReferenceHybridService hybrid = mock(ReferenceHybridService.class);
    private final MockRetrievalServiceImpl service =
            new MockRetrievalServiceImpl(hybrid, new ObjectMapper());

    @Test
    void retrieve_selectedDocuments_usesUserAndEnvironmentScope() {
        var ids = List.of("selected-document");
        var response = new ReferenceRetrievalResponse("empty", "没有相关资料", List.of(), null);
        when(hybrid.retrieve(7, "项目设计", ids, null)).thenReturn(response);

        var result = service.retrieve(7, "项目设计", ids);

        assertThat(result.path("status").asText()).isEqualTo("empty");
        verify(hybrid).retrieve(7, "项目设计", ids, null);
    }

    @Test
    void retrieve_noSelectedDocuments_doesNotSearch() {
        var result = service.retrieve(7, "项目设计", List.of());

        assertThat(result.path("status").asText()).isEqualTo("disabled");
        verifyNoInteractions(hybrid);
    }

    @Test
    void retrieve_localFailure_preservesFailureForOrchestration() {
        var ids = List.of("selected-document");
        when(hybrid.retrieve(7, "项目设计", ids, null))
                .thenThrow(new IllegalStateException("retrieval unavailable"));

        assertThatThrownBy(() -> service.retrieve(7, "项目设计", ids))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("retrieval unavailable");
    }
}
