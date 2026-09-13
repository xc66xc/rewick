package com.interview.copilot.service.auth;

import com.interview.copilot.response.auth.LoginResponse;

public interface AuthenticationService {
    LoginResponse login(String address, String identifier, String password, String clientType);

    void logout(String token);
}
