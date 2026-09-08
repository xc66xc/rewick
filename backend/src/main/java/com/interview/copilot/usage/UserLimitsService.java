package com.interview.copilot.usage;

import com.interview.copilot.common.ApiException;
import com.interview.copilot.config.PlatformLimitsProperties;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class UserLimitsService {
    private final UsageMapper mapper;
    private final PlatformLimitsProperties defaults;

    public UserLimitsService(UsageMapper mapper, PlatformLimitsProperties defaults) {
        this.mapper = mapper;
        this.defaults = defaults;
    }

    public EffectiveLimits effective(long userId) {
        var row = mapper.findLimits(userId);
        if (row == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "账户不可用。");
        return new EffectiveLimits(row.dailyAnswers() == null ? defaults.dailyAnswers() : row.dailyAnswers(),
                row.dailyKnowledgeQueries() == null ? defaults.dailyKnowledgeQueries() : row.dailyKnowledgeQueries(),
                defaults.maxAsrSessionSeconds());
    }

    public record EffectiveLimits(int dailyAnswers, int dailyKnowledgeQueries, int maxAsrSessionSeconds) {}
}
