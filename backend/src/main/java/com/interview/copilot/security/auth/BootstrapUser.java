package com.interview.copilot.security.auth;

import com.interview.copilot.config.AuthProperties;
import com.interview.copilot.mapper.user.UserMapper;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

@Component
public class BootstrapUser implements ApplicationRunner {
    private final AuthProperties properties;
    private final UserMapper users;
    private final PasswordEncoder passwords;

    public BootstrapUser(AuthProperties properties, UserMapper users, PasswordEncoder passwords) {
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
        validate(identifier, password);
        users.lockIdentityChanges();
        if (users.findByIdentifier(identifier) != null) return;
        users.createBootstrap(identifier, passwords.encode(password));
    }

    private void validate(String identifier, String password) {
        if (!identifier.matches("[A-Za-z0-9_.@-]{3,64}")) {
            throw new IllegalStateException(
                    "Bootstrap identifier must contain 3–64 permitted characters");
        }
        int bytes = password.getBytes(StandardCharsets.UTF_8).length;
        if (password.length() < 12 || bytes > 72) {
            throw new IllegalStateException(
                    "Bootstrap password must contain at least 12 characters and at most 72 UTF-8"
                            + " bytes");
        }
    }
}
