package com.interview.copilot.service.email;

public interface EmailPasswordResetService {
    void sendCode(String email);

    void resetPassword(String email, String password, String code);
}
