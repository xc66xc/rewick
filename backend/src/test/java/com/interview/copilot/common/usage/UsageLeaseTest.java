package com.interview.copilot.common.usage;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;

import com.interview.copilot.service.usage.UsageService;

import org.junit.jupiter.api.Test;

public class UsageLeaseTest {
    @Test
    void close_completedLease_doesNotOverwriteCompletion() {
        UsageService service = mock(UsageService.class);
        UsageLease lease = new UsageLease(service, 9L, "request-1", "llm", "session-1");

        lease.complete();
        lease.cancel();
        lease.close();

        verify(service).finish(9L, "request-1", "llm", "complete");
        verifyNoMoreInteractions(service);
    }

    @Test
    void close_unfinishedLease_marksCancelled() {
        UsageService service = mock(UsageService.class);

        new UsageLease(service, 9L, "request-1", "llm", "session-1").close();

        verify(service).finish(9L, "request-1", "llm", "cancelled");
    }
}
