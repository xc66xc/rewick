package com.interview.copilot.auth.email;

import com.interview.copilot.auth.AuthService;
import com.interview.copilot.auth.UserEntity;
import com.interview.copilot.auth.UserMapper;
import com.interview.copilot.common.ServerTime;
import java.time.Clock;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EmailRegistration {
    private final EmailCodeStore codes;
    private final EmailIdentityMapper identities;
    private final UserMapper users;
    private final AuthService auth;
    private final Clock clock;

    public EmailRegistration(EmailCodeStore codes, EmailIdentityMapper identities, UserMapper users, AuthService auth, Clock clock) {
        this.codes = codes;
        this.identities = identities;
        this.users = users;
        this.auth = auth;
        this.clock = clock;
    }

    @Transactional(noRollbackFor = EmailErrors.InvalidCode.class)
    public AuthService.LoginResult register(String email, String passwordHash, String code) {
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
        } catch (DuplicateKeyException error) { throw EmailErrors.registered(); }
        return auth.issueToken(user);
    }
}
