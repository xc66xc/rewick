package com.interview.copilot.service.impl.references;

import com.interview.copilot.common.references.ReferenceWork;
import com.interview.copilot.common.usage.UsageLease;
import com.interview.copilot.response.references.ReferenceRetrievalResponse;
import com.interview.copilot.service.references.ReferenceCancellationService;
import com.interview.copilot.service.references.ReferenceHybridService;
import com.interview.copilot.service.references.ReferenceStorageService;
import com.interview.copilot.service.usage.UsageService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CancellationException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ReferenceSearchServiceTest {
    private final ReferenceStorageService storage = mock(ReferenceStorageService.class);
    private final UsageService usage = mock(UsageService.class);
    private final ReferenceHybridService hybrid = mock(ReferenceHybridService.class);
    private final ReferenceCancellationService cancellations = mock(ReferenceCancellationService.class);
    private final ReferenceSearchServiceImpl service =
            new ReferenceSearchServiceImpl(storage, usage, hybrid, cancellations);
    private final UUID document = UUID.randomUUID();
    private final List<String> ids = List.of(document.toString());

    @Test
    void search_selectedDocument_preservesScopeAndSettlesKnowledgeLease() {
        var work = mock(ReferenceWork.class);
        var lease = mock(UsageLease.class);
        var response = new ReferenceRetrievalResponse("empty", "无命中", List.of(), null);
        when(cancellations.register(7, "request")).thenReturn(work);
        when(usage.start(7, "request", "knowledge")).thenReturn(lease);
        when(hybrid.retrieve(7, "设计", ids, null)).thenReturn(response);

        assertThat(service.search(7, "request", "设计", List.of(document))).isSameAs(response);

        var order = inOrder(storage, usage, hybrid, lease, work);
        order.verify(storage).requireAll(7, ids);
        order.verify(usage).start(7, "request", "knowledge");
        order.verify(hybrid).retrieve(7, "设计", ids, null);
        order.verify(lease).complete();
        order.verify(lease).close();
        order.verify(work).close();
    }

    @Test
    void search_noSelectedDocuments_skipsRetrievalAndLease() {
        assertThat(service.search(7, "request", "设计", List.of()).status()).isEqualTo("disabled");

        verifyNoInteractions(storage, usage, hybrid, cancellations);
    }

    @Test
    void search_foreignDocument_rejectsBeforeStartingLease() {
        doThrow(new IllegalStateException("foreign document")).when(storage).requireAll(7, ids);

        assertThatThrownBy(() -> service.search(7, "request", "设计", List.of(document)))
                .hasMessage("foreign document");
        verifyNoInteractions(usage, hybrid, cancellations);
    }

    @Test
    void search_cancelled_releasesWorkAndCancelsLease() {
        var work = mock(ReferenceWork.class);
        var lease = mock(UsageLease.class);
        when(cancellations.register(7, "request")).thenReturn(work);
        when(usage.start(7, "request", "knowledge")).thenReturn(lease);
        when(hybrid.retrieve(7, "设计", ids, null)).thenThrow(new CancellationException("cancelled"));

        assertThatThrownBy(() -> service.search(7, "request", "设计", List.of(document)))
                .isInstanceOf(CancellationException.class);
        verify(lease).cancel();
        verify(lease).close();
        verify(work).close();
    }
}
