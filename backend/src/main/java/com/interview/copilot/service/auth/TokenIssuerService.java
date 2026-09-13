package com.interview.copilot.service.auth;

import com.interview.copilot.entity.user.UserEntity;
import com.interview.copilot.response.auth.LoginResponse;

public interface TokenIssuerService {
    LoginResponse issue(UserEntity user, String clientType);
}
