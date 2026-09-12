package com.interview.copilot.service.impl.usage;

import com.interview.copilot.common.Page;
import com.interview.copilot.converter.usage.UsageConverter;
import com.interview.copilot.dto.usage.UsageDTO;
import com.interview.copilot.dto.usage.UsageFilter;
import com.interview.copilot.mapper.usage.AdminUsageMapper;
import com.interview.copilot.service.usage.AdminUsageService;
import com.interview.copilot.validation.admin.AdminInput;

import org.springframework.stereotype.Service;

import java.util.Set;

@Service
public class AdminUsageServiceImpl implements AdminUsageService {
    private static final Set<String> CAPABILITIES = Set.of("", "llm", "knowledge", "asr");
    private static final Set<String> STATUSES =
            Set.of("", "started", "complete", "failed", "cancelled", "expired");
    private final AdminUsageMapper mapper;

    public AdminUsageServiceImpl(AdminUsageMapper mapper) {
        this.mapper = mapper;
    }

    public Page<UsageDTO> list(
            String userId,
            String query,
            String capability,
            String status,
            String model,
            AdminInput.Paging paging) {
        if (!CAPABILITIES.contains(capability) || !STATUSES.contains(status))
            throw AdminInput.invalid();
        Long id = userId.isEmpty() ? null : AdminInput.id(userId);
        var filter =
                new UsageFilter(
                        id,
                        capability,
                        status,
                        AdminInput.bounded(model, 256),
                        AdminInput.bounded(query, 254));
        return new Page<>(
                mapper.page(filter, paging.size(), paging.offset()).stream()
                        .map(UsageConverter::toDTO)
                        .toList(),
                mapper.count(filter),
                paging.page(),
                paging.size());
    }
}
