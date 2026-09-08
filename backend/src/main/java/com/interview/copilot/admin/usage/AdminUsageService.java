package com.interview.copilot.admin.usage;

import com.interview.copilot.admin.AdminInput;
import com.interview.copilot.admin.Page;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class AdminUsageService {
    private static final Set<String> CAPABILITIES = Set.of("", "llm", "knowledge", "asr");
    private static final Set<String> STATUSES = Set.of("", "started", "complete", "failed", "cancelled", "expired");
    private final AdminUsageMapper mapper;

    public AdminUsageService(AdminUsageMapper mapper) { this.mapper = mapper; }

    public Page<UsageView> list(String userId, String capability, String status, String model, AdminInput.Paging paging) {
        if (!CAPABILITIES.contains(capability) || !STATUSES.contains(status)) throw AdminInput.invalid();
        Long id = userId.isEmpty() ? null : AdminInput.id(userId);
        var filter = new AdminUsageMapper.Filter(id, capability, status, AdminInput.bounded(model, 256));
        return new Page<>(mapper.page(filter, paging.size(), paging.offset()), mapper.count(filter), paging.page(), paging.size());
    }
}
