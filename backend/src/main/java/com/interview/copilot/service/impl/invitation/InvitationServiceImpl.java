package com.interview.copilot.service.impl.invitation;

import com.interview.copilot.entity.invitation.InvitationSettingsEntity;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.mapper.invitation.InvitationMapper;
import com.interview.copilot.mapper.wallet.WalletMapper;
import com.interview.copilot.response.invitation.InvitationSettingsResponse;
import com.interview.copilot.response.invitation.InvitationSummaryResponse;
import com.interview.copilot.service.invitation.InvitationService;
import com.interview.copilot.service.wallet.WalletService;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.Locale;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 邀请码与邀请时长奖励。
 */
@Service
public class InvitationServiceImpl implements InvitationService {
    private static final String ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    private static final long MAX_BALANCE = 315360000L;
    private final SecureRandom random = new SecureRandom();
    private final InvitationMapper mapper;
    private final WalletMapper wallets;
    private final WalletService walletService;

    public InvitationServiceImpl(
            InvitationMapper mapper, WalletMapper wallets, WalletService walletService) {
        this.mapper = mapper;
        this.wallets = wallets;
        this.walletService = walletService;
    }

    public InvitationSettingsResponse settings() {
        var value = mapper.settings();
        return new InvitationSettingsResponse(
                value.enabled(), value.rewardSeconds(), value.version());
    }

    public InvitationSummaryResponse mine(long userId) {
        requireUser(userId);
        var settings = mapper.settings();
        var code = mapper.codeForUser(userId);
        var stats = mapper.stats(userId);
        return new InvitationSummaryResponse(
                code == null ? "" : code.code(),
                settings.enabled(),
                settings.rewardSeconds(),
                stats.invitedCount(),
                stats.rewardedSeconds());
    }

    @Transactional
    public InvitationSummaryResponse ensureCode(long userId) {
        wallets.lockUser(userId);
        requireUser(userId);
        requireEnabled(mapper.lockSettings());
        if (mapper.codeForUser(userId) != null) return mine(userId);
        for (int attempt = 0; attempt < 12; attempt++) {
            var code = new StringBuilder(6);
            for (int i = 0; i < 6; i++)
                code.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
            if (mapper.createCode(userId, code.toString(), wallets.now()) == 1) return mine(userId);
        }
        throw new ApiException(
                HttpStatus.SERVICE_UNAVAILABLE, "invitation_generation_failed", "邀请码生成失败，请稍后重试。");
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void reward(long inviteeId, String rawCode) {
        if (rawCode == null || rawCode.isBlank()) return;
        String code = rawCode.trim().toUpperCase(Locale.ROOT);
        if (!code.matches("[A-Z2-9]{6}")) throw invalid();
        var owner = mapper.byCode(code);
        if (owner == null || owner.userId() == inviteeId) throw invalid();
        // The invitee was just created in this transaction and is not yet visible.
        // Lock the existing inviter before their wallet, matching all other credits.
        wallets.lockUser(owner.userId());
        if (!mapper.eligible(owner.userId())) throw invalid();
        var settings = mapper.lockSettings();
        requireEnabled(settings);
        wallets.ensureWallet(owner.userId());
        walletService.state(owner.userId());
        var wallet = wallets.lockWallet(owner.userId());
        long after = Math.addExact(wallet.availableSeconds(), settings.rewardSeconds());
        if (after > MAX_BALANCE)
            throw new ApiException(
                    HttpStatus.CONFLICT, "invitation_balance_limit", "邀请人时长已达上限，请联系管理员或清空邀请码后注册。");
        var now = wallets.now();
        Long invitation =
                mapper.bind(
                        owner.userId(),
                        inviteeId,
                        code,
                        settings.rewardSeconds(),
                        settings.version(),
                        now);
        if (invitation == null)
            throw new ApiException(HttpStatus.CONFLICT, "invitation_already_bound", "该账号已绑定邀请人。");
        mapper.credit(owner.userId(), wallet.availableSeconds(), after, invitation, now);
        wallets.balance(owner.userId(), after, now);
    }

    private void requireEnabled(InvitationSettingsEntity settings) {
        if (!settings.enabled())
            throw new ApiException(
                    HttpStatus.CONFLICT, "invitation_disabled", "邀请活动已关闭，请清空邀请码后继续注册。");
    }

    private void requireUser(long userId) {
        if (!mapper.eligible(userId))
            throw new ApiException(HttpStatus.FORBIDDEN, "invitation_forbidden", "此账号不能参与邀请活动。");
    }

    private ApiException invalid() {
        return new ApiException(
                HttpStatus.BAD_REQUEST, "invalid_invitation_code", "邀请码无效或邀请人已停用，请修改或清空后继续注册。");
    }
}
