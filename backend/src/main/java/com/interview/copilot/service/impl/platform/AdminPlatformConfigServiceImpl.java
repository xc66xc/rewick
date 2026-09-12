package com.interview.copilot.service.impl.platform;

import com.interview.copilot.model.platform.PlatformConfig;
import com.interview.copilot.request.platform.PlatformConfigRequest;
import com.interview.copilot.response.platform.PlatformConfigResponse;
import com.interview.copilot.service.platform.AdminPlatformConfigService;
import com.interview.copilot.service.platform.PlatformConfigService;

import org.springframework.stereotype.Service;

@Service
public class AdminPlatformConfigServiceImpl implements AdminPlatformConfigService {
    private final PlatformConfigService service;

    public AdminPlatformConfigServiceImpl(PlatformConfigService service) {
        this.service = service;
    }

    public PlatformConfigResponse get() {
        return response(service.get());
    }

    public PlatformConfigResponse publish(long actor, PlatformConfigRequest input) {
        return response(
                service.publish(
                        actor,
                        new PlatformConfig(
                                input.version(),
                                input.providers(),
                                input.models(),
                                input.defaultModelId(),
                                input.asr(),
                                input.knowledge(),
                                input.embedding())));
    }

    private PlatformConfigResponse response(PlatformConfig value) {
        return new PlatformConfigResponse(
                value.version(),
                value.providers(),
                value.models(),
                value.defaultModelId(),
                value.asr(),
                value.knowledge(),
                value.embedding());
    }
}
