package com.interview.copilot.security.auth;

import com.interview.copilot.config.AdminBootstrapProperties;
import com.interview.copilot.entity.user.UserEntity;
import com.interview.copilot.mapper.user.UserMapper;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class BootstrapAdmin implements ApplicationRunner {
    private final AdminBootstrapProperties properties;
    private final UserMapper users;
    private final PasswordEncoder passwords;

    public BootstrapAdmin(
            AdminBootstrapProperties properties, UserMapper users, PasswordEncoder passwords) {
        this.properties = properties;
        this.users = users;
        this.passwords = passwords;
    }

    @Override
    @org.springframework.transaction.annotation.Transactional
    public void run(ApplicationArguments arguments) {
        String identifier = properties.bootstrapUsername();
        String password = properties.bootstrapPassword();
        if (identifier.isBlank() && password.isBlank()) return;
        if (!identifier.matches("[A-Za-z0-9_.@-]{3,64}") || !PasswordRules.isValid(password)) {
            throw new IllegalStateException(
                    "Administrator bootstrap credentials do not satisfy identifier/password"
                            + " requirements");
        }
        users.lockIdentityChanges();
        UserEntity existing = users.findByIdentifier(identifier);
        if (existing != null) {
            requireAdmin(existing);
            return;
        }
        if (users.createAdminBootstrap(identifier, passwords.encode(password)) == 0) {
            requireAdmin(users.findByIdentifier(identifier));
        }
    }

    private void requireAdmin(UserEntity existing) {
        if (existing == null || !"ADMIN".equals(existing.getRole())) {
            throw new IllegalStateException(
                    "Administrator bootstrap cannot promote an existing ordinary account");
        }
    }
}
