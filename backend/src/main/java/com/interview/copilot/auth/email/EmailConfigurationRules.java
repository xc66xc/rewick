package com.interview.copilot.auth.email;

import com.interview.copilot.common.ApiException;
import java.net.URI;
import org.springframework.http.HttpStatus;

final class EmailConfigurationRules {
    private EmailConfigurationRules() {}

    static EmailConfiguration normalize(EmailConfiguration input) {
        if (input == null || input.host() == null || input.username() == null || input.from() == null) throw invalid();
        if (input.version() < 0 || input.host().length() > 253 || input.username().length() > 254 || input.from().length() > 254) throw invalid();
        if (input.port() < 1 || input.port() > 65535 || (input.startTls() && input.ssl())) throw invalid();
        if (input.password() != null && (input.password().length() > 4096 || controls(input.password()))) throw invalid();
        if (controls(input.host()) || controls(input.username()) || controls(input.from())) throw invalid();
        String host = input.host().strip().toLowerCase(java.util.Locale.ROOT);
        if (!host.isEmpty()) validateHost(host);
        String from = input.from().isBlank() ? "" : EmailAddress.normalize(input.from());
        return new EmailConfiguration(input.version(), input.enabled(), host, input.port(), input.username().strip(),
                false, input.password(), from, input.startTls(), input.ssl());
    }

    static void complete(SmtpProperties smtp) {
        if (smtp.host().isBlank() || smtp.from().isBlank()) throw invalid();
        if (smtp.username().isBlank() != smtp.password().isBlank()) throw invalid();
        if (!smtp.starttls() && !smtp.ssl() && !loopback(smtp.host())) throw invalid();
    }

    static boolean changed(EmailConfiguration input, EmailConfigurationMapper.Stored previous) {
        return !input.host().equals(previous.host()) || input.port() != previous.port() || !input.username().equals(previous.username());
    }

    private static void validateHost(String host) {
        try {
            String bracketed = host.contains(":") ? "[" + host + "]" : host;
            URI uri = URI.create("smtp://" + bracketed);
            if (uri.getHost() == null || uri.getRawUserInfo() != null || uri.getPort() != -1 || !uri.getRawPath().isEmpty()
                    || uri.getRawQuery() != null || uri.getRawFragment() != null) throw invalid();
        } catch (IllegalArgumentException error) { throw invalid(); }
    }

    private static boolean controls(String value) { return value.codePoints().anyMatch(Character::isISOControl); }
    private static boolean loopback(String host) { return host.equals("localhost") || host.equals("127.0.0.1") || host.equals("::1"); }
    static ApiException invalid() { return new ApiException(HttpStatus.BAD_REQUEST, "invalid_email_config", "请检查邮件服务配置、认证信息和加密方式。"); }
    static ApiException conflict() { return new ApiException(HttpStatus.CONFLICT, "email_config_conflict", "邮件配置已被修改，请刷新后重试。"); }
}
