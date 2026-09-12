package com.interview.copilot.converter.usage;

import com.interview.copilot.dto.usage.UsageDTO;
import com.interview.copilot.entity.usage.UsageEventEntity;
import com.interview.copilot.vo.usage.UsageVO;

public final class UsageConverter {
    private UsageConverter() {}

    public static UsageDTO toDTO(UsageEventEntity value) {
        return new UsageDTO(
                value.id(),
                value.userId(),
                value.displayName(),
                value.requestId(),
                value.capability(),
                value.model(),
                value.status(),
                value.createdAt(),
                value.finishedAt());
    }

    public static UsageVO toVO(UsageDTO value) {
        return new UsageVO(
                value.id(),
                value.userId(),
                value.displayName(),
                value.requestId(),
                value.capability(),
                value.model(),
                value.status(),
                value.createdAt(),
                value.finishedAt());
    }
}
