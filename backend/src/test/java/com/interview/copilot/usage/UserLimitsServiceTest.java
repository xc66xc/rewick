package com.interview.copilot.usage;

import com.interview.copilot.common.ApiException;
import com.interview.copilot.config.PlatformLimitsProperties;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class UserLimitsServiceTest {
    private final UsageMapper mapper = mock(UsageMapper.class);
    private final UserLimitsService limits = new UserLimitsService(mapper, new PlatformLimitsProperties(100, 300, 3600));

    @Test
    void effective_missingOverrides_inheritsDeploymentDefaults() {
        when(mapper.findLimits(1)).thenReturn(new UsageMapper.QuotaOverride(1, null, null));

        assertThat(limits.effective(1)).isEqualTo(new UserLimitsService.EffectiveLimits(100, 300, 3600));
    }

    @Test
    void effective_zeroOverride_doesNotFallBackToDefaults() {
        when(mapper.findLimits(1)).thenReturn(new UsageMapper.QuotaOverride(1, 0, 2));

        assertThat(limits.effective(1)).isEqualTo(new UserLimitsService.EffectiveLimits(0, 2, 3600));
    }

    @Test
    void effective_unavailableAccount_isRejected() {
        assertThatThrownBy(() -> limits.effective(1)).isInstanceOf(ApiException.class);
    }
}
