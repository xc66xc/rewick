package com.interview.copilot.service.impl.background;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.entity.background.BackgroundEntity;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.mapper.background.BackgroundMapper;
import com.interview.copilot.model.background.BackgroundKind;
import com.interview.copilot.service.auth.SessionGuardService;
import com.interview.copilot.service.background.BackgroundService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class EnvironmentStampServiceTest {
    private final ObjectMapper json = new ObjectMapper();
    private final BackgroundMapper records = mock(BackgroundMapper.class);
    private final SessionGuardService users = mock(SessionGuardService.class);
    private final BackgroundService background = mock(BackgroundService.class);
    private final EnvironmentStampServiceImpl service = new EnvironmentStampServiceImpl(records, users, background, json);
    private final String id = UUID.randomUUID().toString();
    private final String mutation = UUID.randomUUID().toString();

    @BeforeEach
    void setup() {
        when(users.lockUser(7)).thenReturn(7L);
    }

    private ObjectNode stamp(String text) {
        return json.createObjectNode().put("text", text).put("color", "amber");
    }

    private BackgroundEntity saved(String mutationId, boolean deleted) {
        return new BackgroundEntity(id, "{\"name\":\"面试\",\"stamp\":{\"text\":\"待跟进\",\"color\":\"amber\"}}", 2,
                mutationId, deleted, LocalDateTime.now(), LocalDateTime.now());
    }

    @Test
    void save_ownedEnvironment_locksBeforeWriteAndPreservesOtherContent() throws Exception {
        when(records.find(7, BackgroundKind.environments, id)).thenReturn(saved(UUID.randomUUID().toString(), false));
        service.save(7, id, 2, mutation, stamp("  已通过  "));

        var captured = ArgumentCaptor.forClass(String.class);
        var ordered = inOrder(users, records);
        ordered.verify(users).lockUser(7);
        ordered.verify(records).find(7, BackgroundKind.environments, id);
        ordered.verify(records).update(eq(7L), eq(BackgroundKind.environments), eq(id), captured.capture(), eq(mutation));
        assertThat(json.readTree(captured.getValue()).path("name").asText()).isEqualTo("面试");
        assertThat(json.readTree(captured.getValue()).path("stamp")).isEqualTo(stamp("已通过"));
        verify(background).detail(7, BackgroundKind.environments, id);
    }

    @Test
    void save_sameMutationNormalizedStamp_returnsWithoutVersionIncrement() {
        when(records.find(7, BackgroundKind.environments, id)).thenReturn(saved(mutation, false));
        var result = json.createObjectNode().put("version", 2);
        when(background.detail(7, BackgroundKind.environments, id)).thenReturn(result);
        assertThat(service.save(7, id, 1, mutation, stamp("  待跟进  "))).isSameAs(result);
        verify(records, never()).update(anyLong(), any(), any(), any(), any());
    }

    @Test
    void save_sameMutationDifferentStamp_rejectsConflict() {
        when(records.find(7, BackgroundKind.environments, id)).thenReturn(saved(mutation, false));
        assertThatThrownBy(() -> service.save(7, id, 2, mutation, stamp("已通过"))).isInstanceOf(ApiException.class);
        verify(records, never()).update(anyLong(), any(), any(), any(), any());
    }

    @Test
    void save_staleVersion_rejectsConflict() {
        when(records.find(7, BackgroundKind.environments, id)).thenReturn(saved(UUID.randomUUID().toString(), false));
        assertThatThrownBy(() -> service.save(7, id, 1, mutation, stamp("已通过"))).isInstanceOf(ApiException.class);
        verify(records, never()).update(anyLong(), any(), any(), any(), any());
    }

    @Test
    void save_missingOrDeletedEnvironment_neverCreatesOrWrites() {
        assertThatThrownBy(() -> service.save(7, id, 1, mutation, stamp("已通过"))).isInstanceOf(ApiException.class);
        when(records.find(7, BackgroundKind.environments, id)).thenReturn(saved(mutation, true));
        assertThatThrownBy(() -> service.save(7, id, 2, mutation, stamp("已通过"))).isInstanceOf(ApiException.class);
        verify(records, never()).update(anyLong(), any(), any(), any(), any());
    }

    @Test
    void save_missingPrincipal_neverReadsEnvironment() {
        when(users.lockUser(8)).thenReturn(null);
        assertThatThrownBy(() -> service.save(8, id, 1, mutation, stamp("已通过"))).isInstanceOf(ApiException.class);
        verify(records, never()).find(eq(8L), any(), any());
    }

    @Test
    void save_explicitNull_clearsStamp() throws Exception {
        when(records.find(7, BackgroundKind.environments, id)).thenReturn(saved(UUID.randomUUID().toString(), false));
        service.save(7, id, 2, mutation, json.nullNode());
        var captured = ArgumentCaptor.forClass(String.class);
        verify(records).update(eq(7L), eq(BackgroundKind.environments), eq(id), captured.capture(), eq(mutation));
        assertThat(json.readTree(captured.getValue()).path("stamp").isNull()).isTrue();
    }
}
