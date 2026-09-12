package com.interview.copilot.service.impl.email;

import com.interview.copilot.dto.email.EmailConfiguration;
import com.interview.copilot.request.email.EmailConfigRequest;
import com.interview.copilot.response.email.EmailConfigResponse;
import com.interview.copilot.service.email.AdminEmailConfigService;
import com.interview.copilot.service.email.EmailConfigurationService;

import org.springframework.stereotype.Service;

@Service
public class AdminEmailConfigServiceImpl implements AdminEmailConfigService {
    private final EmailConfigurationService service;

    public AdminEmailConfigServiceImpl(EmailConfigurationService service) {
        this.service = service;
    }

    public EmailConfigResponse get() {
        return response(service.get());
    }

    public EmailConfigResponse publish(long actor, EmailConfigRequest input) {
        return response(
                service.publish(
                        actor,
                        new EmailConfiguration(
                                input.version(),
                                input.enabled(),
                                input.host(),
                                input.port(),
                                input.username(),
                                input.hasPassword(),
                                input.password(),
                                input.from(),
                                input.startTls(),
                                input.ssl())));
    }

    private EmailConfigResponse response(EmailConfiguration value) {
        return new EmailConfigResponse(
                value.version(),
                value.enabled(),
                value.host(),
                value.port(),
                value.username(),
                value.hasPassword(),
                value.password(),
                value.from(),
                value.startTls(),
                value.ssl());
    }
}
