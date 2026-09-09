package com.interview.copilot.auth.email;

final class EmailTestData {
    static final String SECRET = "YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODk=";
    private EmailTestData() {}
    static EmailAuthProperties policy() { return new EmailAuthProperties(true, SECRET, 600, 60, 5, 5, 20, 30); }
    static SmtpProperties smtp() { return new SmtpProperties("smtp.example.com", 587, "smtp-user", "test-password", "mail@example.com", true, false, 5000); }
}
