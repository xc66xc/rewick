package com.interview.copilot.auth;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class BootstrapAdmin implements ApplicationRunner {
    private final AdminBootstrapProperties properties;
    private final UserMapper users;
    private final PasswordEncoder passwords;

    public BootstrapAdmin(AdminBootstrapProperties properties, UserMapper users, PasswordEncoder passwords) {
        this.properties = properties;
        this.users = users;
        this.passwords = passwords;
    }

    @Override
    public void run(ApplicationArguments arguments) {
        String username = properties.bootstrapUsername();
        String password = properties.bootstrapPassword();
        if (username.isBlank() && password.isBlank()) return;
        if (!username.matches("[A-Za-z0-9_.@-]{3,64}") || !PasswordRules.isValid(password)) {
            throw new IllegalStateException("Administrator bootstrap credentials do not satisfy username/password requirements");
        }
        UserEntity existing = users.findByUsername(username);
        if (existing != null) {
            requireAdmin(existing);
            return;
        }
        if (users.createAdminBootstrap(username, passwords.encode(password)) == 0) {
            requireAdmin(users.findByUsername(username));
        }
    }

    private void requireAdmin(UserEntity existing) {
        if (existing == null || !"ADMIN".equals(existing.getRole())) {
            throw new IllegalStateException("Administrator bootstrap cannot promote an existing ordinary account");
        }
    }
}
