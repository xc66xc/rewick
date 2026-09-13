package com.interview.copilot.service.impl.wallet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.interview.copilot.exception.ApiException;
import com.interview.copilot.mapper.wallet.WalletMapper;
import com.interview.copilot.service.auth.SessionGuardService;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class WalletServiceTest {
    @Test
    void state_missingUser_rejectsBeforeCreatingOrLockingWallet() {
        WalletMapper mapper = mock(WalletMapper.class);
        var guard = mock(SessionGuardService.class);
        when(guard.lockUser(7L)).thenReturn(null);
        var service = new WalletServiceImpl(mapper, guard);

        assertThatThrownBy(() -> service.state(7L))
                .isInstanceOfSatisfying(
                        ApiException.class,
                        error -> {
                            assertThat(error.status()).isEqualTo(HttpStatus.NOT_FOUND);
                            assertThat(error.code()).isEqualTo("user_not_found");
                        });

        verify(mapper, never()).ensureWallet(anyLong());
        verify(mapper, never()).lockWallet(anyLong());
    }
}
