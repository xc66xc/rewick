package com.interview.copilot.service.email;

import com.interview.copilot.dto.email.EmailConfiguration;
import com.interview.copilot.response.email.EmailProbeResponse;

public interface EmailProbeService {
    EmailProbeResponse test(long actorId, EmailConfiguration config);
}
