package com.interview.copilot.auth.email;

import java.time.Clock;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EmailCodeStore {
    private final EmailCodeMapper codes;
    private final EmailAuthProperties policy;
    private final EmailCodeSecrets secrets;
    private final Clock clock;

    public EmailCodeStore(EmailCodeMapper codes, EmailAuthProperties policy, EmailCodeSecrets secrets, Clock clock) {
        this.codes = codes;
        this.policy = policy;
        this.secrets = secrets;
        this.clock = clock;
    }

    @Transactional
    public EmailCodeSecrets.Code reserve(String email) {
        Instant now = clock.instant();
        codes.ensure(email, now);
        EmailCodeMapper.Verification previous = codes.lock(email);
        if (previous.nextSendAt().isAfter(now)) throw EmailErrors.limited();
        boolean newWindow = !previous.windowStartedAt().plusSeconds(3600).isAfter(now);
        int count = newWindow ? 0 : previous.sendCount();
        if (count >= policy.hourlySendLimit()) throw EmailErrors.limited();
        EmailCodeSecrets.Code code = secrets.generate(email);
        codes.reserve(email, code, now.plusSeconds(policy.codeTtlSeconds()), now.plusSeconds(policy.resendSeconds()),
                newWindow ? now : previous.windowStartedAt(), count + 1);
        return code;
    }

    @Transactional
    public void delivered(String email, String nonce) {
        if (codes.delivered(email, nonce, "ready") != 1) throw EmailErrors.unavailable();
    }

    @Transactional
    public void failed(String email, String nonce) { codes.delivered(email, nonce, "failed"); }

    // The registration transaction retains this row lock through user/token creation and consumption.
    @Transactional(propagation = Propagation.MANDATORY, noRollbackFor = EmailErrors.InvalidCode.class)
    public void verifyAndConsume(String email, String code) {
        EmailCodeMapper.Verification stored = codes.lock(email);
        if (stored == null || !"ready".equals(stored.status()) || !stored.expiresAt().isAfter(clock.instant())
                || stored.failedAttempts() >= policy.maximumAttempts()) throw new EmailErrors.InvalidCode();
        if (!secrets.matches(email, stored.nonce(), code, stored.codeDigest())) {
            codes.failAttempt(email);
            throw new EmailErrors.InvalidCode();
        }
        codes.consume(email);
    }
}
