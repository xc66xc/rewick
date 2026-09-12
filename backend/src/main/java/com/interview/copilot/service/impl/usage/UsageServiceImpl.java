package com.interview.copilot.service.impl.usage;

import com.interview.copilot.common.usage.UsageLease;
import com.interview.copilot.config.PlatformLimitsProperties;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.mapper.usage.UsageMapper;
import com.interview.copilot.service.usage.UsageService;
import com.interview.copilot.service.wallet.WalletService;
import com.interview.copilot.util.ServerTime;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Set;

@Service
public class UsageServiceImpl implements UsageService {
    private static final Set<String> CAPABILITIES = Set.of("llm", "knowledge", "asr");
    private final UsageMapper mapper;
    private final PlatformLimitsProperties limits;
    private final Clock clock;
    private final WalletService wallets;

    public UsageServiceImpl(
            UsageMapper mapper,
            PlatformLimitsProperties limits,
            Clock clock,
            WalletService wallets) {
        this.mapper = mapper;
        this.limits = limits;
        this.clock = clock;
        this.wallets = wallets;
    }

    @Transactional
    public UsageLease start(long userId, String requestId, String capability) {
        validate(requestId, capability);
        String sessionId = wallets.requireActive(userId);
        if (mapper.lockUser(userId) == null)
            throw new ApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "账户不可用。");
        if (mapper.countRequest(userId, requestId, capability) > 0) {
            throw new ApiException(HttpStatus.CONFLICT, "duplicate_request", "此请求已经提交，请勿重复发送。");
        }
        LocalDateTime now = ServerTime.now(clock);
        mapper.expire(userId, now);
        reserve(userId, capability, now);
        long duration = capability.equals("asr") ? limits.maxAsrSessionSeconds() + 30L : 600L;
        mapper.create(userId, requestId, capability, now.plusSeconds(duration));
        return new UsageLease(this, userId, requestId, capability, sessionId);
    }

    public void finish(long userId, String requestId, String capability, String status) {
        mapper.finish(userId, requestId, capability, status, ServerTime.now(clock));
    }

    public void describeModel(long userId, String requestId, String capability, String model) {
        validate(requestId, capability);
        String value = model == null ? "" : model;
        if (value.length() > 256 || value.chars().anyMatch(Character::isISOControl)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_model", "模型标识无效。");
        }
        mapper.describeModel(userId, requestId, capability, value);
    }

    private void reserve(long userId, String capability, LocalDateTime now) {
        if (capability.equals("asr")) {
            if (mapper.activeAsr(userId) > 0) throw limited("同一账户只能同时进行一场平台转写。");
            return;
        }
    }

    public boolean active(long userId, String sessionId) {
        return wallets.isActive(userId, sessionId);
    }

    private void validate(String requestId, String capability) {
        if (requestId == null || !requestId.matches("[A-Za-z0-9._:-]{1,128}")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_request", "请求标识无效。");
        }
        if (capability == null || !CAPABILITIES.contains(capability))
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_capability", "平台能力无效。");
    }

    private ApiException limited(String message) {
        return new ApiException(HttpStatus.TOO_MANY_REQUESTS, "quota_exceeded", message);
    }
}
