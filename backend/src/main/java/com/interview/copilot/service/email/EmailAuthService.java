package com.interview.copilot.service.email;

import com.interview.copilot.response.auth.LoginResponse;

public interface EmailAuthService {
    void sendCode(String email);

    LoginResponse register(String email, String password, String code, String invitationCode);
}
