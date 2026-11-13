package com.interview.copilot.service.impl.references;

import com.interview.copilot.common.usage.UsageLease;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.request.references.SearchReferenceBatchRequest;
import com.interview.copilot.response.references.ReferenceBatchRetrievalResponse;
import com.interview.copilot.service.auth.SessionGuardService;
import com.interview.copilot.service.references.ReferenceBatchRetrievalService;
import com.interview.copilot.service.references.ReferenceStorageService;
import com.interview.copilot.service.usage.UsageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CancellationException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class ReferenceBatchSearchServiceTest {
    private final ReferenceStorageService documents = mock(ReferenceStorageService.class);
    private final UsageService usage = mock(UsageService.class);
    private final ReferenceBatchRetrievalService retrieval = mock(ReferenceBatchRetrievalService.class);
    private final SessionGuardService sessions = mock(SessionGuardService.class);
    private final ReferenceCancellationServiceImpl cancellations = new ReferenceCancellationServiceImpl();
    private final ReferenceBatchSearchServiceImpl service = new ReferenceBatchSearchServiceImpl(documents, usage, retrieval, cancellations, sessions);
    private final String request = UUID.randomUUID().toString();
    private final SearchReferenceBatchRequest input = new SearchReferenceBatchRequest(
            List.of(new SearchReferenceBatchRequest.Query("q1", "SSE")), List.of(UUID.randomUUID()));

    @BeforeEach
    void lease() {
        when(usage.startForSession(1, request, "knowledge", 10)).thenAnswer(call -> new UsageLease(usage, 1, request, "knowledge", "synthetic"));
        when(usage.active(1, "synthetic")).thenReturn(true);
        when(retrieval.retrieve(1, input, null)).thenReturn(new ReferenceBatchRetrievalResponse("empty", "", List.of(), List.of(), null, null));
    }

    @Test
    void search_revokedTokenAtCompletion_discardsResultAndSettlesFailure() {
        doNothing().doThrow(new ApiException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "synthetic")).when(sessions).requireSession(1, 10);

        assertThatThrownBy(() -> service.search(1, 10, request, input, null)).isInstanceOf(ApiException.class);

        verify(usage).finish(1, request, "knowledge", "failed");
        verify(usage, never()).finish(1, request, "knowledge", "complete");
        try (var released = cancellations.register(1, request)) { /* request ownership was released */ }
    }

    @Test
    void search_interviewEndsBeforeCompletion_discardsResultAndReleasesOwnership() {
        when(usage.active(1, "synthetic")).thenReturn(false);

        assertThatThrownBy(() -> service.search(1, 10, request, input, null)).isInstanceOfSatisfying(ApiException.class,
                error -> org.assertj.core.api.Assertions.assertThat(error.status()).isEqualTo(HttpStatus.CONFLICT));

        verify(usage).finish(1, request, "knowledge", "failed");
        try (var released = cancellations.register(1, request)) { /* no active ownership remains */ }
    }

    @Test
    void search_cancelBeforeRegister_startsNeitherLeaseNorRetrieval() {
        cancellations.cancel(1, request);

        assertThatThrownBy(() -> service.search(1, 10, request, input, null)).isInstanceOf(CancellationException.class);

        verify(usage, never()).startForSession(1, request, "knowledge", 10);
        verifyNoInteractions(retrieval);
    }

    @Test
    void search_invalidTenantDocument_startsNoBillableWork() {
        doThrow(new ApiException(HttpStatus.NOT_FOUND, "REFERENCE_NOT_FOUND", "synthetic")).when(documents)
                .requireAll(1, input.referenceIds().stream().map(Object::toString).toList());

        assertThatThrownBy(() -> service.search(1, 10, request, input, null)).isInstanceOf(ApiException.class);

        verify(usage, never()).startForSession(1, request, "knowledge", 10);
        verifyNoInteractions(retrieval);
    }
}
