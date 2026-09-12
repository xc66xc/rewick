package com.interview.copilot.service.impl.email;

import com.interview.copilot.common.email.RegistrationMailSender;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.exception.email.EmailErrors;
import com.interview.copilot.mapper.email.EmailIdentityMapper;
import com.interview.copilot.response.auth.LoginResponse;
import com.interview.copilot.security.auth.PasswordRules;
import com.interview.copilot.security.email.EmailCodeSecrets;
import com.interview.copilot.security.email.EmailCodeStore;
import com.interview.copilot.security.email.EmailRegistration;
import com.interview.copilot.service.email.EmailAuthService;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class EmailAuthServiceImpl implements EmailAuthService {
    private final RegistrationMailSender mail;
    private final EmailCodeStore codes;
    private final EmailRegistration registration;
    private final PasswordEncoder passwords;
    private final EmailIdentityMapper identities;

    public EmailAuthServiceImpl(
            RegistrationMailSender mail,
            EmailCodeStore codes,
            EmailRegistration registration,
            PasswordEncoder passwords,
            EmailIdentityMapper identities) {
        this.mail = mail;
        this.codes = codes;
        this.registration = registration;
        this.passwords = passwords;
        this.identities = identities;
    }

    public void sendCode(String email) {
        if (identities.exists(email)) throw EmailErrors.registered();
        mail.requireConfigured();
        EmailCodeSecrets.Code code = codes.reserve(email, "register");
        try {
            mail.send(email, code.value(), "register");
            codes.delivered(email, "register", code.nonce());
        } catch (ApiException error) {
            codes.failed(email, "register", code.nonce());
            throw error;
        }
    }

    public LoginResponse register(String email, String password, String code) {
        mail.requireConfigured();
        if (!PasswordRules.isValid(password)) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST, "invalid_password", "密码至少 12 个字符，且不超过 72 个 UTF-8 字节。");
        }
        return registration.register(email, passwords.encode(password), code);
    }
}
