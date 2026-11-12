package com.interview.copilot.service.impl.questions;

import com.interview.copilot.exception.ApiException;
import com.interview.copilot.service.auth.SessionGuardService;
import com.interview.copilot.service.questions.QuestionRewriteAccessService;
import com.interview.copilot.service.wallet.WalletService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public final class QuestionRewriteAccessServiceImpl implements QuestionRewriteAccessService {
    private final SessionGuardService sessions;
    private final WalletService wallets;

    public QuestionRewriteAccessServiceImpl(SessionGuardService sessions, WalletService wallets) {
        this.sessions = sessions;
        this.wallets = wallets;
    }

    public String require(long user, long token) {
        sessions.requireSession(user, token);
        return wallets.requireActive(user);
    }

    public void requireActive(long user, long token, String sessionId) {
        sessions.requireSession(user, token);
        if (!wallets.isActive(user, sessionId)) throw new ApiException(HttpStatus.CONFLICT,
                "INTERVIEW_NOT_ACTIVE", "面试已结束，请重新开始面试。");
    }
}
