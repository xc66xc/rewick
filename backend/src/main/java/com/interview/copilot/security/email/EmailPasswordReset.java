package com.interview.copilot.security.email;

import com.interview.copilot.entity.user.UserEntity;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.exception.email.EmailErrors;
import com.interview.copilot.mapper.auth.TokenMapper;
import com.interview.copilot.mapper.user.UserMapper;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class EmailPasswordReset {
    private final EmailCodeStore codes;
    private final UserMapper users;
    private final TokenMapper tokens;
    private final com.interview.copilot.service.wallet.WalletService wallets;

    public EmailPasswordReset(
            EmailCodeStore codes,
            UserMapper users,
            TokenMapper tokens,
            com.interview.copilot.service.wallet.WalletService wallets) {
        this.codes = codes;
        this.users = users;
        this.tokens = tokens;
        this.wallets = wallets;
    }

    @Transactional(noRollbackFor = EmailErrors.InvalidCode.class)
    public void reset(String email, String passwordHash, String code) {
        codes.verifyAndConsume(email, "password_reset", code);
        // Login holds this same user lock until token creation, so an old password cannot race
        // revocation.
        UserEntity user = users.findForEmailLogin(email);
        if (user == null) throw EmailErrors.notRegistered();
        if (!user.isEnabled()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "account_disabled", "账号已停用，请联系管理员。");
        }
        users.updatePassword(user.getId(), passwordHash);
        tokens.revokeAll(user.getId());
        wallets.endCurrent(user.getId());
    }
}
