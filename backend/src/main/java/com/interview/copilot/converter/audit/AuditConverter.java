package com.interview.copilot.converter.audit;

import com.interview.copilot.dto.audit.AuditDTO;
import com.interview.copilot.entity.audit.AuditEventEntity;
import com.interview.copilot.vo.audit.AuditVO;

public final class AuditConverter {
    private AuditConverter() {}

    public static AuditDTO toDTO(AuditEventEntity value) {
        return new AuditDTO(
                value.id(),
                value.actorId(),
                value.actorDisplayName(),
                value.action(),
                value.target(),
                value.createdAt());
    }

    public static AuditVO toVO(AuditDTO value) {
        return new AuditVO(
                value.id(),
                value.actorId(),
                value.actorDisplayName(),
                value.action(),
                value.target(),
                value.createdAt());
    }
}
