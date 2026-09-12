package com.interview.copilot.security.email;

import com.interview.copilot.config.EmailAuthProperties;
import com.interview.copilot.entity.email.EmailCodeDigest;
import com.interview.copilot.entity.email.EmailVerificationEntity;
import com.interview.copilot.exception.email.EmailErrors;
import com.interview.copilot.mapper.email.EmailCodeMapper;
import com.interview.copilot.util.ServerTime;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

@Component
public class EmailCodeStore {
    private final EmailCodeMapper codes;
    private final EmailAuthProperties policy;
    private final EmailCodeSecrets secrets;
    private final Clock clock;

    public EmailCodeStore(
            EmailCodeMapper codes,
            EmailAuthProperties policy,
            EmailCodeSecrets secrets,
            Clock clock) {
        this.codes = codes;
        this.policy = policy;
        this.secrets = secrets;
        this.clock = clock;
    }

    @Transactional
    public EmailCodeSecrets.Code reserve(String email, String purpose) {
        // PostgreSQL timestamps use microseconds; rounding nanos up can reject the first send.
        LocalDateTime now = ServerTime.now(clock);
        codes.ensure(email, purpose, now);
        EmailVerificationEntity previous = codes.lock(email, purpose);
        if (previous.nextSendAt().isAfter(now)) throw EmailErrors.limited();
        boolean newWindow = !previous.windowStartedAt().plusSeconds(3600).isAfter(now);
        int count = newWindow ? 0 : previous.sendCount();
        if (count >= policy.hourlySendLimit()) throw EmailErrors.limited();
        EmailCodeSecrets.Code code = secrets.generate(email + "\n" + purpose);
        codes.reserve(
                email,
                purpose,
                new EmailCodeDigest(code.digest(), code.nonce()),
                now.plusSeconds(policy.codeTtlSeconds()),
                now.plusSeconds(policy.resendSeconds()),
                newWindow ? now : previous.windowStartedAt(),
                count + 1);
        return code;
    }

    @Transactional
    public void delivered(String email, String purpose, String nonce) {
        if (codes.delivered(email, purpose, nonce, "ready") != 1) throw EmailErrors.unavailable();
    }

    @Transactional
    public void failed(String email, String purpose, String nonce) {
        codes.delivered(email, purpose, nonce, "failed");
    }

    // The registration transaction retains this row lock through user/token creation and
    // consumption.
    @Transactional(
            propagation = Propagation.MANDATORY,
            noRollbackFor = EmailErrors.InvalidCode.class)
    public void verifyAndConsume(String email, String purpose, String code) {
        EmailVerificationEntity stored = codes.lock(email, purpose);
        if (stored == null
                || !"ready".equals(stored.status())
                || !stored.expiresAt().isAfter(ServerTime.now(clock))
                || stored.failedAttempts() >= policy.maximumAttempts())
            throw new EmailErrors.InvalidCode();
        if (!secrets.matches(email + "\n" + purpose, stored.nonce(), code, stored.codeDigest())) {
            codes.failAttempt(email, purpose);
            throw new EmailErrors.InvalidCode();
        }
        codes.consume(email, purpose);
    }
}
