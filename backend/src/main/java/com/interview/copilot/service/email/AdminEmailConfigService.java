package com.interview.copilot.service.email;

import com.interview.copilot.request.email.EmailConfigRequest;
import com.interview.copilot.response.email.EmailConfigResponse;

public interface AdminEmailConfigService {
    EmailConfigResponse get();

    EmailConfigResponse publish(long actor, EmailConfigRequest input);
}
