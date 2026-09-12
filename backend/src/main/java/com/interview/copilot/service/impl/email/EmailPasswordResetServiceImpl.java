package com.interview.copilot.service.impl.email;

import com.interview.copilot.common.email.RegistrationMailSender;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.exception.email.EmailErrors;
import com.interview.copilot.mapper.email.EmailIdentityMapper;
import com.interview.copilot.security.auth.PasswordRules;
import com.interview.copilot.security.email.EmailCodeSecrets;
import com.interview.copilot.security.email.EmailCodeStore;
import com.interview.copilot.security.email.EmailPasswordReset;
import com.interview.copilot.service.email.EmailPasswordResetService;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class EmailPasswordResetServiceImpl implements EmailPasswordResetService {
    private final RegistrationMailSender mail;
    private final EmailCodeStore codes;
    private final EmailIdentityMapper identities;
    private final EmailPasswordReset reset;
    private final PasswordEncoder passwords;

    public EmailPasswordResetServiceImpl(
            RegistrationMailSender mail,
            EmailCodeStore codes,
            EmailIdentityMapper identities,
            EmailPasswordReset reset,
            PasswordEncoder passwords) {
        this.mail = mail;
        this.codes = codes;
        this.identities = identities;
        this.reset = reset;
        this.passwords = passwords;
    }

    public void sendCode(String email) {
        requireRegistered(email);
        mail.requireResetConfigured();
        EmailCodeSecrets.Code code = codes.reserve(email, "password_reset");
        try {
            mail.send(email, code.value(), "password_reset");
            codes.delivered(email, "password_reset", code.nonce());
        } catch (ApiException error) {
            codes.failed(email, "password_reset", code.nonce());
            throw error;
        }
    }

    public void resetPassword(String email, String password, String code) {
        requireRegistered(email);
        if (!PasswordRules.isValid(password)) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST, "invalid_password", "密码至少 12 个字符，且不超过 72 个 UTF-8 字节。");
        }
        reset.reset(email, passwords.encode(password), code);
    }

    private void requireRegistered(String email) {
        if (!identities.hasEmailIdentity(email)) throw EmailErrors.notRegistered();
    }
}
