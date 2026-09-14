package com.interview.copilot.security.email;

import com.interview.copilot.entity.user.UserEntity;
import com.interview.copilot.exception.email.EmailErrors;
import com.interview.copilot.mapper.email.EmailIdentityMapper;
import com.interview.copilot.mapper.user.UserMapper;
import com.interview.copilot.response.auth.LoginResponse;
import com.interview.copilot.service.auth.AuthService;
import com.interview.copilot.service.invitation.InvitationService;
import com.interview.copilot.util.ServerTime;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;

@Component
public class EmailRegistration {
    private final EmailCodeStore codes;
    private final EmailIdentityMapper identities;
    private final UserMapper users;
    private final AuthService auth;
    private final Clock clock;
    private final InvitationService invitations;

    public EmailRegistration(
            EmailCodeStore codes,
            EmailIdentityMapper identities,
            UserMapper users,
            AuthService auth,
            Clock clock,
            InvitationService invitations) {
        this.codes = codes;
        this.identities = identities;
        this.users = users;
        this.auth = auth;
        this.clock = clock;
        this.invitations = invitations;
    }

    @Transactional(noRollbackFor = EmailErrors.InvalidCode.class)
    public LoginResponse register(
            String email, String passwordHash, String code, String invitationCode) {
        codes.verifyAndConsume(email, "register", code);
        if (identities.exists(email)) throw EmailErrors.registered();
        UserEntity user = new UserEntity();
        user.setDisplayName(email);
        user.setPasswordHash(passwordHash);
        user.setRole("USER");
        user.setEnabled(true);
        user.setEmail(email);
        try {
            users.createEmailUser(user);
            identities.create(user.getId(), email, ServerTime.now(clock));
        } catch (DuplicateKeyException error) {
            throw EmailErrors.registered();
        }
        invitations.reward(user.getId(), invitationCode);
        return auth.issueToken(user);
    }
}
