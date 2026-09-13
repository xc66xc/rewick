package com.interview.copilot.common.platform;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.service.platform.DesktopSettingsService;

/** Existing provider tests exercise authorized users' explicit service choices. */
public final class DesktopSettingsFixture {
    private DesktopSettingsFixture() {}

    public static DesktopSettingsService advanced() {
        var service = mock(DesktopSettingsService.class);
        when(service.advanced(anyLong())).thenReturn(true);
        when(service.llm(anyLong(), any(ObjectNode.class)))
                .thenAnswer(call -> call.<ObjectNode>getArgument(1).deepCopy());
        when(service.asr(anyLong(), nullable(String.class)))
                .thenAnswer(call -> call.getArgument(1));
        when(service.knowledge(anyLong(), nullable(String.class)))
                .thenAnswer(call -> call.getArgument(1));
        return service;
    }
}
