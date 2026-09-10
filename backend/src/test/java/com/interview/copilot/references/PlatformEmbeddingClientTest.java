package com.interview.copilot.references;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.ai.ProviderHttpClient;
import com.interview.copilot.ai.ProviderProperties;
import com.interview.copilot.common.ApiException;
import com.interview.copilot.platform.PlatformRuntimeResolver;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.any;

class PlatformEmbeddingClientTest {
    private final ProviderHttpClient http = mock(ProviderHttpClient.class);
    private final PlatformEmbeddingClient client = new PlatformEmbeddingClient(mock(PlatformRuntimeResolver.class), http);
    private final ObjectMapper json = new ObjectMapper();
    private PlatformEmbeddingClient.Selection selection() {
        var config = new ProviderProperties.Embedding();
        config.setModel("platform-fixture"); config.setDimensions(1024);
        return new PlatformEmbeddingClient.Selection(config, "fingerprint");
    }

    @Test void embed_outOfOrderSupplierRows_returnsInputOrderWithoutMetadata() {
        when(http.json(any(),any(),any())).thenReturn(Mono.just(json.valueToTree(Map.of("data",List.of(
                Map.of("index",1,"embedding",Collections.nCopies(1024,0.2)),
                Map.of("index",0,"embedding",Collections.nCopies(1024,0.1)))))));
        assertThat(client.embed(selection(),List.of("资料一","资料二"))).containsExactly(
                Collections.nCopies(1024,0.1),Collections.nCopies(1024,0.2));
    }
    @Test void embed_wrongDimension_rejectsInsteadOfPadding() {
        when(http.json(any(),any(),any())).thenReturn(Mono.just(json.valueToTree(Map.of("data",List.of(
                Map.of("index",0,"embedding",Collections.nCopies(512,0.1)))))));
        assertThatThrownBy(() -> client.embed(selection(),List.of("资料"))).isInstanceOf(ApiException.class);
    }
    @Test void embed_nonFiniteCoordinate_rejectsBeforeStorage() {
        when(http.json(any(),any(),any())).thenReturn(Mono.just(json.valueToTree(Map.of("data",List.of(
                Map.of("index",0,"embedding",Collections.nCopies(1024,Double.POSITIVE_INFINITY)))))));
        assertThatThrownBy(() -> client.embed(selection(),List.of("资料"))).isInstanceOf(ApiException.class);
    }
    @Test void embed_providerFailure_releasesCapacityForNextRequest() {
        when(http.json(any(),any(),any())).thenReturn(Mono.error(new IllegalStateException("fixture")));
        for(int i=0;i<8;i++) assertThatThrownBy(() -> client.embed(selection(),List.of("资料"))).isInstanceOf(IllegalStateException.class);
        verify(http,times(8)).json(any(),any(),any());
    }
    @Test void embed_emptyBatch_neverCallsSupplier() {
        assertThatThrownBy(() -> client.embed(selection(),List.of())).isInstanceOf(ApiException.class);
        verifyNoInteractions(http);
    }
}
