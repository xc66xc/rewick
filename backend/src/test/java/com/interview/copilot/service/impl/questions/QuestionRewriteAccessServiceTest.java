package com.interview.copilot.service.impl.questions;

import com.interview.copilot.exception.ApiException;
import com.interview.copilot.service.auth.SessionGuardService;
import com.interview.copilot.service.wallet.WalletService;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class QuestionRewriteAccessServiceTest {
    private final SessionGuardService sessions = mock(SessionGuardService.class);
    private final WalletService wallets = mock(WalletService.class);
    private final QuestionRewriteAccessServiceImpl access = new QuestionRewriteAccessServiceImpl(sessions, wallets);

    @Test
    void require_checksDesktopLoginAndActiveInterviewWithoutAdvancedPermission() {
        when(wallets.requireActive(7)).thenReturn("interview-1");
        assertThat(access.require(7, 70)).isEqualTo("interview-1");
        verify(sessions).requireSession(7, 70);
        verify(wallets).requireActive(7);
    }

    @Test
    void requireActive_oldInterviewEnded_rejectsEvenWhenUserMayStartAnother() {
        when(wallets.isActive(7, "interview-1")).thenReturn(false);
        assertThatThrownBy(() -> access.requireActive(7, 70, "interview-1"))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("INTERVIEW_NOT_ACTIVE");
    }
}
