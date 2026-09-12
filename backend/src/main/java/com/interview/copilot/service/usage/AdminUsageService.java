package com.interview.copilot.service.usage;

import com.interview.copilot.common.Page;
import com.interview.copilot.dto.usage.UsageDTO;
import com.interview.copilot.validation.admin.AdminInput;

public interface AdminUsageService {
    Page<UsageDTO> list(
            String userId,
            String query,
            String capability,
            String status,
            String model,
            AdminInput.Paging paging);
}
