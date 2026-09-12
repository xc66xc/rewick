package com.interview.copilot.service.impl.wallet;

import com.interview.copilot.common.Page;
import com.interview.copilot.dto.wallet.WalletAdjustment;
import com.interview.copilot.entity.wallet.WalletEntity;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.mapper.wallet.WalletAdminMapper;
import com.interview.copilot.mapper.wallet.WalletMapper;
import com.interview.copilot.response.wallet.WalletResponse;
import com.interview.copilot.response.wallet.WalletTransactionResponse;
import com.interview.copilot.service.wallet.WalletAdminService;
import com.interview.copilot.service.wallet.WalletService;
import com.interview.copilot.util.ServerTime;
import com.interview.copilot.validation.admin.AdminInput;
import com.interview.copilot.validation.wallet.WalletInput;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Objects;
import java.util.Set;

@Service
public class WalletAdminServiceImpl implements WalletAdminService {
    private final WalletMapper repository;
    private final WalletService wallets;
    private final WalletAdminMapper mapper;
    private final Clock clock;

    public WalletAdminServiceImpl(
            WalletMapper repository, WalletService wallets, WalletAdminMapper mapper, Clock clock) {
        this.repository = repository;
        this.wallets = wallets;
        this.mapper = mapper;
        this.clock = clock;
    }

    @Transactional
    public WalletResponse adjust(long actor, long userId, WalletAdjustment input) {
        validate(input);
        authorize(actor);
        lockWallet(userId);
        var row = mapper.adjustment(userId, input.requestId());
        if (row != null) {
            if (!Objects.equals(row.operation(), input.operation())
                    || !Objects.equals(row.requestedSeconds(), input.seconds())
                    || !Objects.equals(row.expectedVersion(), input.expectedVersion())
                    || !Objects.equals(row.reason(), input.reason())
                    || !Objects.equals(row.actorId(), actor)) throw conflict();
            return wallets.state(userId);
        }
        var before = wallets.state(userId);
        if (before.version() != input.expectedVersion())
            throw new ApiException(
                    HttpStatus.CONFLICT, "wallet_version_conflict", "可用时长已变化，请刷新后重试。");
        long after = calculate(before.availableSeconds(), input);
        LocalDateTime now = ServerTime.now(clock);
        repository.balance(userId, after, now);
        mapper.insertAdjustment(userId, input, before.availableSeconds(), after, actor, now);
        shorten(userId, after, now);
        return wallets.state(userId);
    }

    public Page<WalletTransactionResponse> transactions(long userId, AdminInput.Paging paging) {
        var rows =
                mapper.transactions(userId, paging.size(), paging.offset()).stream()
                        .map(
                                row ->
                                        new WalletTransactionResponse(
                                                row.id(),
                                                row.deltaSeconds(),
                                                row.beforeSeconds(),
                                                row.afterSeconds(),
                                                row.reason(),
                                                row.actorDisplayName(),
                                                row.sessionId(),
                                                ServerTime.instant(row.createdAt())))
                        .toList();
        return new Page<>(rows, mapper.count(userId), paging.page(), paging.size());
    }

    public void endCurrent(long userId) {
        wallets.endCurrent(userId);
    }

    private void shorten(long userId, long after, LocalDateTime now) {
        var session = repository.latest(userId);
        if (session == null || !"active".equals(session.status())) return;
        LocalDateTime exhaustion = session.startedAt().plusSeconds(session.usedSeconds() + after);
        LocalDateTime expiry =
                exhaustion.isBefore(session.expiresAt()) ? exhaustion : session.expiresAt();
        repository.save(
                session.update(
                        expiry,
                        after == 0 ? now : null,
                        session.usedSeconds(),
                        after == 0 ? "exhausted" : null),
                now);
    }

    private long calculate(long before, WalletAdjustment input) {
        long after =
                switch (input.operation()) {
                    case "add" -> before + input.seconds();
                    case "subtract" -> before - input.seconds();
                    default -> input.seconds();
                };
        if (after < 0 || after > 315360000L)
            throw new ApiException(
                    HttpStatus.BAD_REQUEST, "invalid_duration", "调整后的时长必须在 0 到 315360000 秒之间。");
        return after;
    }

    private void authorize(long actor) {
        boolean valid = mapper.authorized(actor);
        if (!Boolean.TRUE.equals(valid))
            throw new ApiException(HttpStatus.FORBIDDEN, "forbidden", "无权执行管理操作。");
    }

    private void validate(WalletAdjustment input) {
        WalletInput.uuid(input.requestId());
        if (input.operation() == null
                || !Set.of("add", "subtract", "set").contains(input.operation())
                || input.seconds() == null
                || input.seconds() < 0
                || input.seconds() > 315360000L
                || input.expectedVersion() == null
                || input.expectedVersion() < 0
                || input.reason() == null
                || input.reason().isBlank()
                || input.reason().length() > 500) throw AdminInput.invalid();
    }

    private ApiException conflict() {
        return new ApiException(HttpStatus.CONFLICT, "duplicate_request", "请求标识已用于其他调整。");
    }

    private WalletEntity lockWallet(long userId) {
        if (repository.lockUser(userId) == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "user_not_found", "用户不存在。");
        }
        repository.ensureWallet(userId);
        return repository.lockWallet(userId);
    }
}
