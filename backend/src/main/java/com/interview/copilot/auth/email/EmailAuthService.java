package com.interview.copilot.auth.email;

import com.interview.copilot.auth.AuthService;
import com.interview.copilot.auth.PasswordRules;
import com.interview.copilot.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class EmailAuthService {
    private final RegistrationMailSender mail;
    private final EmailCodeStore codes;
    private final EmailRegistration registration;
    private final PasswordEncoder passwords;
    private final EmailIdentityMapper identities;

    public EmailAuthService(RegistrationMailSender mail, EmailCodeStore codes, EmailRegistration registration,
            PasswordEncoder passwords, EmailIdentityMapper identities) {
        this.mail = mail;
        this.codes = codes;
        this.registration = registration;
        this.passwords = passwords;
        this.identities = identities;
    }

    public void sendCode(String email) {
        mail.requireConfigured();
        EmailCodeSecrets.Code code = codes.reserve(email);
        if (identities.exists(email)) { codes.failed(email, code.nonce()); return; }
        try {
            mail.send(email, code.value());
            codes.delivered(email, code.nonce());
        } catch (ApiException error) {
            codes.failed(email, code.nonce());
            throw error;
        }
    }

    public AuthService.LoginResult register(String email, String password, String code) {
        mail.requireConfigured();
        if (!PasswordRules.isValid(password)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_password", "密码至少 12 个字符，且不超过 72 个 UTF-8 字节。");
        }
        return registration.register(email, passwords.encode(password), code);
    }
}
