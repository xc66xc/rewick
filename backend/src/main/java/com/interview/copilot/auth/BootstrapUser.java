package com.interview.copilot.auth;

import java.nio.charset.StandardCharsets;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

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
    public void run(ApplicationArguments arguments) {
        String username = properties.bootstrapUsername();
        String password = properties.bootstrapPassword();
        if (username.isBlank() && password.isBlank()) return;
        validate(username, password);
        if (users.findByUsername(username) != null) return;
        users.createBootstrap(username, passwords.encode(password));
    }

    private void validate(String username, String password) {
        if (!username.matches("[A-Za-z0-9_.@-]{3,64}")) {
            throw new IllegalStateException("Bootstrap username must contain 3–64 permitted characters");
        }
        int bytes = password.getBytes(StandardCharsets.UTF_8).length;
        if (password.length() < 12 || bytes > 72) {
            throw new IllegalStateException("Bootstrap password must contain at least 12 characters and at most 72 UTF-8 bytes");
        }
    }
}
