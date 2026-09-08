package com.interview.copilot.usage;

import com.interview.copilot.common.ApiException;
import com.interview.copilot.config.PlatformLimitsProperties;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UsageService {
    private static final Set<String> CAPABILITIES = Set.of("llm", "knowledge", "asr");
    private final UsageMapper mapper;
    private final PlatformLimitsProperties limits;
    private final Clock clock;
    private final UserLimitsService userLimits;

    public UsageService(UsageMapper mapper, PlatformLimitsProperties limits, Clock clock, UserLimitsService userLimits) {
        this.mapper = mapper;
        this.limits = limits;
        this.clock = clock;
        this.userLimits = userLimits;
    }

    @Transactional
    public UsageLease start(long userId, String requestId, String capability) {
        validate(requestId, capability);
        if (mapper.lockUser(userId) == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "账户不可用。");
        if (mapper.countRequest(userId, requestId, capability) > 0) {
            throw new ApiException(HttpStatus.CONFLICT, "duplicate_request", "此请求已经提交，请勿重复发送。");
        }
        Instant now = clock.instant();
        mapper.expire(userId, now);
        reserve(userId, capability, now);
        long duration = capability.equals("asr") ? limits.maxAsrSessionSeconds() + 30L : 600L;
        mapper.create(userId, requestId, capability, now.plusSeconds(duration));
        return new UsageLease(this, userId, requestId, capability);
    }

    void finish(long userId, String requestId, String capability, String status) {
        mapper.finish(userId, requestId, capability, status, clock.instant());
    }

    public void describeModel(long userId, String requestId, String capability, String model) {
        validate(requestId, capability);
        String value = model == null ? "" : model;
        if (value.length() > 256 || value.chars().anyMatch(Character::isISOControl)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_model", "模型标识无效。");
        }
        mapper.describeModel(userId, requestId, capability, value);
    }

    private void reserve(long userId, String capability, Instant now) {
        if (capability.equals("asr")) {
            if (mapper.activeAsr(userId) > 0) throw limited("同一账户只能同时进行一场平台转写。");
            return;
        }
        var effective = userLimits.effective(userId);
        int limit = capability.equals("llm") ? effective.dailyAnswers() : effective.dailyKnowledgeQueries();
        LocalDate day = now.atZone(ZoneOffset.UTC).toLocalDate();
        mapper.ensureDaily(userId, day, capability);
        if (mapper.reserveDaily(userId, day, capability, limit) == 0) throw limited("该能力今日请求次数已达上限。");
    }

    private void validate(String requestId, String capability) {
        if (requestId == null || !requestId.matches("[A-Za-z0-9._:-]{1,128}")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_request", "请求标识无效。");
        }
        if (capability == null || !CAPABILITIES.contains(capability)) throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_capability", "平台能力无效。");
    }

    private ApiException limited(String message) {
        return new ApiException(HttpStatus.TOO_MANY_REQUESTS, "quota_exceeded", message);
    }
}
