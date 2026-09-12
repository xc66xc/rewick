package com.interview.copilot.service.usage;

import com.interview.copilot.common.Page;
import com.interview.copilot.validation.admin.AdminInput;
import com.interview.copilot.vo.usage.UsageVO;

public interface AdminUsageService {
    Page<UsageVO> list(
            String userId,
            String query,
            String capability,
            String status,
            String model,
            AdminInput.Paging paging);
}
