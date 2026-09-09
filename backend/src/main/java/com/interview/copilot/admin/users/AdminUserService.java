package com.interview.copilot.admin.users;

import com.interview.copilot.admin.AdminInput;
import com.interview.copilot.admin.Page;
import com.interview.copilot.admin.audit.AuditService;
import com.interview.copilot.auth.PasswordRules;
import com.interview.copilot.auth.TokenMapper;
import com.interview.copilot.auth.UserEntity;
import com.interview.copilot.common.ApiException;
import com.interview.copilot.config.PlatformLimitsProperties;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminUserService {
    private final AdminUserMapper mapper;
    private final PasswordEncoder passwords;
    private final TokenMapper tokens;
    private final AuditService audit;
    private final PlatformLimitsProperties defaults;

    public AdminUserService(AdminUserMapper mapper, PasswordEncoder passwords, TokenMapper tokens,
            AuditService audit, PlatformLimitsProperties defaults) {
        this.mapper = mapper;
        this.passwords = passwords;
        this.tokens = tokens;
        this.audit = audit;
        this.defaults = defaults;
    }

    public Page<UserView> list(String query, AdminInput.Paging paging) {
        AdminInput.bounded(query, 254);
        return new Page<>(mapper.page(query, paging.size(), paging.offset(), defaults.dailyAnswers(),
                defaults.dailyKnowledgeQueries()), mapper.count(query), paging.page(), paging.size());
    }

    @Transactional
    public UserView create(long actorId, String identifier, String password, int answers, int knowledge) {
        validateQuotas(answers, knowledge);
        if (identifier == null || !identifier.matches("[A-Za-z0-9_.@-]{3,64}")) throw AdminInput.invalid();
        String hash = encode(password);
        authorize(actorId);
        UserEntity user = new UserEntity();
        user.setDisplayName(identifier);
        user.setPasswordHash(hash);
        user.setDailyAnswers(answers);
        user.setDailyKnowledgeQueries(knowledge);
        try {
            mapper.create(user);
            mapper.createAccountIdentity(user.getId(), identifier);
        } catch (DuplicateKeyException error) {
            throw new ApiException(HttpStatus.CONFLICT, "identifier_exists", "登录账号已存在。");
        }
        audit.record(actorId, "user.create", target(user.getId()));
        return view(user.getId());
    }

    @Transactional
    public UserView update(long actorId, long userId, boolean enabled, int answers, int knowledge) {
        validateQuotas(answers, knowledge);
        authorize(actorId);
        AdminUserMapper.Account account = requireAccount(userId);
        if (!enabled) protectAdministrators(actorId, account);
        mapper.update(userId, enabled, answers, knowledge);
        if (!enabled) tokens.revokeAll(userId);
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
        audit.record(actorId, "user.password_reset", target(userId));
    }

    @Transactional
    public void revokeTokens(long actorId, long userId) {
        authorize(actorId);
        requireAccount(userId);
        tokens.revokeAll(userId);
        audit.record(actorId, "user.tokens_revoke", target(userId));
    }

    private void authorize(long actorId) {
        mapper.lockChanges();
        var actor = mapper.lockAccount(actorId);
        if (actor == null || !actor.enabled() || !"ADMIN".equals(actor.role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "forbidden", "无权执行管理操作。");
        }
    }

    private AdminUserMapper.Account requireAccount(long userId) {
        var account = mapper.lockAccount(userId);
        if (account == null) throw new ApiException(HttpStatus.NOT_FOUND, "user_not_found", "用户不存在。");
        return account;
    }

    private void protectAdministrators(long actorId, AdminUserMapper.Account account) {
        if (account.id() == actorId) throw new ApiException(HttpStatus.CONFLICT, "cannot_disable_self", "不能禁用自己的账号。");
        if (account.enabled() && "ADMIN".equals(account.role()) && mapper.enabledAdministrators() <= 1) {
            throw new ApiException(HttpStatus.CONFLICT, "last_administrator", "不能禁用最后一个可用管理员。");
        }
    }

    private UserView view(long userId) {
        return mapper.view(userId, defaults.dailyAnswers(), defaults.dailyKnowledgeQueries());
    }

    private void validateQuotas(int answers, int knowledge) {
        if (answers < 0 || answers > 1000000 || knowledge < 0 || knowledge > 1000000) throw AdminInput.invalid();
    }

    private String encode(String password) {
        if (!PasswordRules.isValid(password)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_password", "密码至少 12 个字符，且不能超过 72 个 UTF-8 字节。");
        }
        return passwords.encode(password);
    }

    private String target(long id) { return "user:" + id; }
}
