package com.interview.copilot.service.impl.user;

import com.interview.copilot.common.Page;
import com.interview.copilot.converter.user.UserConverter;
import com.interview.copilot.dto.user.UserDTO;
import com.interview.copilot.entity.user.UserAccountEntity;
import com.interview.copilot.entity.user.UserEntity;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.mapper.auth.TokenMapper;
import com.interview.copilot.mapper.user.AdminUserMapper;
import com.interview.copilot.dto.wallet.WalletAdjustment;
import com.interview.copilot.security.auth.PasswordRules;
import com.interview.copilot.service.audit.AuditService;
import com.interview.copilot.service.user.AdminUserService;
import com.interview.copilot.service.wallet.WalletAdminService;
import com.interview.copilot.validation.admin.AdminInput;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class AdminUserServiceImpl implements AdminUserService {
    public com.interview.copilot.response.auth.PublicUserResponse currentUser(
            com.interview.copilot.security.auth.UserPrincipal user) {
        return new com.interview.copilot.response.auth.PublicUserResponse(
                Long.toString(user.id()), user.displayName(), user.role());
    }

    private final AdminUserMapper mapper;
    private final PasswordEncoder passwords;
    private final TokenMapper tokens;
    private final AuditService audit;
    private final WalletAdminService wallets;

    public AdminUserServiceImpl(
            AdminUserMapper mapper,
            PasswordEncoder passwords,
            TokenMapper tokens,
            AuditService audit,
            WalletAdminService wallets) {
        this.mapper = mapper;
        this.passwords = passwords;
        this.tokens = tokens;
        this.audit = audit;
        this.wallets = wallets;
    }

    public Page<UserDTO> list(String query, AdminInput.Paging paging) {
        AdminInput.bounded(query, 254);
        return new Page<>(
                mapper.page(query, paging.size(), paging.offset()).stream()
                        .map(UserConverter::toDTO)
                        .toList(),
                mapper.count(query),
                paging.page(),
                paging.size());
    }

    @Transactional
    public UserDTO create(long actorId, String identifier, String password, long availableSeconds) {
        if (availableSeconds < 0 || availableSeconds > 315360000L) throw AdminInput.invalid();
        if (identifier == null || !identifier.matches("[A-Za-z0-9_.@-]{3,64}"))
            throw AdminInput.invalid();
        String hash = encode(password);
        authorize(actorId);
        UserEntity user = new UserEntity();
        user.setDisplayName(identifier);
        user.setPasswordHash(hash);
        try {
            mapper.create(user);
            mapper.createAccountIdentity(user.getId(), identifier);
        } catch (DuplicateKeyException error) {
            throw new ApiException(HttpStatus.CONFLICT, "identifier_exists", "登录账号已存在。");
        }
        wallets.adjust(
                actorId,
                user.getId(),
                new WalletAdjustment(
                        UUID.randomUUID().toString(), "set", availableSeconds, 0L, "创建用户初始时长"));
        audit.record(actorId, "user.create", target(user.getId()));
        return view(user.getId());
    }

    @Transactional
    public UserDTO update(long actorId, long userId, boolean enabled) {
        authorize(actorId);
        UserAccountEntity account = requireAccount(userId);
        if (!enabled) protectAdministrators(actorId, account);
        mapper.update(userId, enabled);
        if (!enabled) {
            tokens.revokeAll(userId);
            wallets.endCurrent(userId);
        }
        audit.record(actorId, "user.update", target(userId));
        return view(userId);
    }

    @Transactional
    public void resetPassword(long actorId, long userId, String password) {
        String hash = encode(password);
        authorize(actorId);
        requireAccount(userId);
        mapper.resetPassword(userId, hash);
        tokens.revokeAll(userId);
        wallets.endCurrent(userId);
        audit.record(actorId, "user.password_reset", target(userId));
    }

    @Transactional
    public void revokeTokens(long actorId, long userId) {
        authorize(actorId);
        requireAccount(userId);
        tokens.revokeAll(userId);
        wallets.endCurrent(userId);
        audit.record(actorId, "user.tokens_revoke", target(userId));
    }

    private void authorize(long actorId) {
        mapper.lockChanges();
        var actor = mapper.lockAccount(actorId);
        if (actor == null || !actor.enabled() || !"ADMIN".equals(actor.role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "forbidden", "无权执行管理操作。");
        }
    }

    private UserAccountEntity requireAccount(long userId) {
        var account = mapper.lockAccount(userId);
        if (account == null)
            throw new ApiException(HttpStatus.NOT_FOUND, "user_not_found", "用户不存在。");
        return account;
    }

    private void protectAdministrators(long actorId, UserAccountEntity account) {
        if (account.id() == actorId)
            throw new ApiException(HttpStatus.CONFLICT, "cannot_disable_self", "不能禁用自己的账号。");
        if (account.enabled()
                && "ADMIN".equals(account.role())
                && mapper.enabledAdministrators() <= 1) {
            throw new ApiException(HttpStatus.CONFLICT, "last_administrator", "不能禁用最后一个可用管理员。");
        }
    }

    private UserDTO view(long userId) {
        return UserConverter.toDTO(mapper.view(userId));
    }

    private String encode(String password) {
        if (!PasswordRules.isValid(password)) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST, "invalid_password", "密码至少 12 个字符，且不能超过 72 个 UTF-8 字节。");
        }
        return passwords.encode(password);
    }

    private String target(long id) {
        return "user:" + id;
    }
}
