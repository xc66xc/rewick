package com.interview.copilot.service.auth;

import com.interview.copilot.entity.user.UserEntity;
import com.interview.copilot.response.auth.LoginResponse;
import com.interview.copilot.security.auth.UserPrincipal;

import java.util.Optional;

public interface AuthService {
    LoginResponse login(String identifier, String password, String clientType);

    LoginResponse issueToken(UserEntity user);

    Optional<UserPrincipal> authenticate(String token);

    void logout(String token);
}
