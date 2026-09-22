package com.interview.copilot.service.impl.background;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.entity.background.BackgroundEntity;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.mapper.background.BackgroundMapper;
import com.interview.copilot.mapper.wallet.WalletMapper;
import com.interview.copilot.model.background.BackgroundKind;
import com.interview.copilot.service.auth.SessionGuardService;
import com.interview.copilot.service.wallet.WalletService;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BackgroundHotwordTest {
    private final ObjectMapper json = new ObjectMapper();
    private final BackgroundMapper records = mock(BackgroundMapper.class);
    private final SessionGuardService users = mock(SessionGuardService.class);
    private final BackgroundServiceImpl service = new BackgroundServiceImpl(records, users,
            mock(WalletService.class), json, mock(WalletMapper.class));
    private final String id = UUID.randomUUID().toString();
    private final String mutation = UUID.randomUUID().toString();
    private final String content = "{\"name\":\"Interview\",\"interviewType\":\"technical\",\"resumeId\":null,\"targetId\":null,\"referenceIds\":[],\"hotwords\":[\"Agent\"]}";

    private BackgroundEntity saved() {
        return new BackgroundEntity(id, content, 1, UUID.randomUUID().toString(), false,
                LocalDateTime.now(), LocalDateTime.now());
    }
    @Test void save_legacyClient_preservesSavedWords() throws Exception {
        when(users.lockUser(7L)).thenReturn(7L);
        when(records.find(7L, BackgroundKind.environments, id)).thenReturn(saved());
        var input = (ObjectNode) json.readTree(content);
        input.remove("hotwords");
        service.save(7L, BackgroundKind.environments, id, 1, mutation, input);
        var captured = ArgumentCaptor.forClass(String.class);
        verify(records).update(eq(7L), eq(BackgroundKind.environments), eq(id), captured.capture(), eq(mutation));
        assertThat(json.readTree(captured.getValue()).path("hotwords").get(0).asText()).isEqualTo("Agent");
    }
    @Test void save_explicitEmpty_clearsWords() throws Exception {
        when(users.lockUser(7L)).thenReturn(7L);
        when(records.find(7L, BackgroundKind.environments, id)).thenReturn(saved());
        var input = (ObjectNode) json.readTree(content);
        input.putArray("hotwords");
        service.save(7L, BackgroundKind.environments, id, 1, mutation, input);
        var captured = ArgumentCaptor.forClass(String.class);
        verify(records).update(eq(7L), eq(BackgroundKind.environments), eq(id), captured.capture(), eq(mutation));
        assertThat(json.readTree(captured.getValue()).path("hotwords").isEmpty()).isTrue();
    }
    @Test void asrHotwords_boundSession_readsOwnedEnvironmentNotActiveSelection() {
        when(records.snapshot(7L, "session")).thenReturn("{\"interviewEnvironment\":{\"id\":\"" + id + "\"}}");
        when(records.find(7L, BackgroundKind.environments, id)).thenReturn(saved());
        assertThat(service.asrHotwords(7L, "session")).containsExactly("Agent");
        verify(records, never()).active(anyLong());
        assertThat(service.asrHotwords(8L, "session")).isEmpty();
    }
    @Test void asrHotwords_environmentMissingOrOwnedByOtherUser_returnsNoWords() {
        when(records.snapshot(7L, "session")).thenReturn("{\"interviewEnvironment\":{\"id\":\"" + id + "\"}}");
        assertThat(service.asrHotwords(7L, "session")).isEmpty();
        verify(records).find(7L, BackgroundKind.environments, id);
        verify(records, never()).active(anyLong());
    }
    @Test void asrHotwords_legacySnapshotWithoutEnvironmentId_returnsNoWords() {
        when(records.snapshot(7L, "session")).thenReturn("{\"context\":{}}");
        assertThat(service.asrHotwords(7L, "session")).isEmpty();
        verify(records, never()).active(anyLong());
    }
    @Test void asrHotwords_deletedEnvironment_returnsNoWords() {
        when(records.snapshot(7L, "session")).thenReturn("{\"interviewEnvironment\":{\"id\":\"" + id + "\"}}");
        var saved = saved();
        when(records.find(7L, BackgroundKind.environments, id)).thenReturn(new BackgroundEntity(
                id, content, saved.version(), saved.mutationId(), true, saved.createdAt(), saved.updatedAt()));
        assertThat(service.asrHotwords(7L, "session")).isEmpty();
        verify(records, never()).active(anyLong());
    }
}
