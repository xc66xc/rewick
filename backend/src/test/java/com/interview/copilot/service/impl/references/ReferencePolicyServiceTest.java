package com.interview.copilot.service.impl.references;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.mapper.references.ReferenceMapper;
import com.interview.copilot.request.references.ReferencePolicyRequest;
import com.interview.copilot.service.audit.AuditService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class ReferencePolicyServiceTest {
    private final ObjectMapper json = new ObjectMapper();
    private final ReferenceMapper mapper = mock(ReferenceMapper.class);
    private final AuditService audit = mock(AuditService.class);
    private final ReferencePolicyServiceImpl service = new ReferencePolicyServiceImpl(mapper, audit);

    @Test void update_legacyRequest_preservesConfiguredCounts() throws Exception {
        var data = policyJson();
        data.put("bm25TopK", 10).put("vectorTopK", 8).put("rrfTopN", 6).put("rerankTopN", 3);
        when(mapper.policy()).thenReturn(json.treeToValue(data, ReferencePolicy.class));
        when(mapper.updatePolicy(any())).thenReturn(1);
        var request = legacyRequest();

        service.update(1, request);

        var captured = ArgumentCaptor.forClass(ReferencePolicy.class);
        verify(mapper).updatePolicy(captured.capture());
        assertThat(captured.getValue().rrfTopN()).isEqualTo(6);
        assertThat(captured.getValue().rerankTopN()).isEqualTo(3);
    }
    @Test void update_partialCounts_violateEffectiveRelation_rejectsBeforeWrite() throws Exception {
        when(mapper.policy()).thenReturn(ReferencePolicy.defaults());
        var data = policyJson();
        data.remove(java.util.List.of("bm25TopK", "vectorTopK", "rerankTopN"));
        data.put("rrfTopN", 1);
        var request = json.treeToValue(data, ReferencePolicyRequest.class);

        assertThatThrownBy(() -> service.update(1, request)).isInstanceOf(ApiException.class)
                .hasMessageContaining("rerank≤RRF");
    }
    @Test void update_staleVersion_returnsConflict() throws Exception {
        when(mapper.policy()).thenReturn(ReferencePolicy.defaults());
        when(mapper.updatePolicy(any())).thenReturn(0);

        assertThatThrownBy(() -> service.update(1, legacyRequest())).isInstanceOf(ApiException.class)
                .hasMessageContaining("刷新");
    }
    @Test void deserialize_oldIndexPolicySnapshot_defaultsNewCounts() throws Exception {
        var snake = new ObjectMapper().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
        ObjectNode data = snake.valueToTree(ReferencePolicy.defaults());
        data.remove(java.util.List.of("bm25_top_k", "vector_top_k", "rrf_top_n", "rerank_top_n"));

        var result = snake.treeToValue(data, ReferencePolicy.class);

        assertThat(result.bm25TopK()).isEqualTo(4);
        assertThat(result.vectorTopK()).isEqualTo(4);
        assertThat(result.rrfTopN()).isEqualTo(2);
        assertThat(result.rerankTopN()).isEqualTo(2);
    }
    private ObjectNode policyJson() { return json.valueToTree(ReferencePolicy.defaults()); }
    private ReferencePolicyRequest legacyRequest() throws Exception {
        var data = policyJson();
        data.remove(java.util.List.of("bm25TopK", "vectorTopK", "rrfTopN", "rerankTopN"));
        return json.treeToValue(data, ReferencePolicyRequest.class);
    }
}
