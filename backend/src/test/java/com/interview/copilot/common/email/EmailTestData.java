package com.interview.copilot.common.email;

import com.interview.copilot.config.EmailAuthProperties;
import com.interview.copilot.config.SmtpProperties;

public final class EmailTestData {
    public static final String SECRET = "YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODk=";

    private EmailTestData() {}

    public static EmailAuthProperties policy() {
        return new EmailAuthProperties(true, SECRET, 600, 60, 5, 5, 20, 30);
    }

    public static SmtpProperties smtp() {
        return new SmtpProperties(
                "smtp.example.com",
                587,
                "smtp-user",
                "test-password",
                "mail@example.com",
                true,
                false,
                5000);
    }
}
