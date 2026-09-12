package com.interview.copilot.service.email;

import com.interview.copilot.response.auth.LoginResponse;
import com.interview.copilot.response.email.EmailCodeResponse;

public interface EmailAccountService {
    EmailCodeResponse registrationCode(String address, String email);

    EmailCodeResponse resetCode(String address, String email);

    LoginResponse register(String address, String email, String password, String code);

    void resetPassword(String address, String email, String password, String code);
}
