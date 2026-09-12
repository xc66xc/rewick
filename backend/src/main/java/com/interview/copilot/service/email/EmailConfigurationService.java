package com.interview.copilot.service.email;

import com.interview.copilot.config.SmtpProperties;
import com.interview.copilot.dto.email.EmailConfiguration;

public interface EmailConfigurationService {
    EmailConfiguration get();

    EmailConfiguration publish(long actorId, EmailConfiguration input);

    Prepared draft(EmailConfiguration input);

    Prepared snapshot();

    public record Prepared(EmailConfiguration view, SmtpProperties smtp) {
        @Override
        public String toString() {
            return "PreparedEmailConfiguration[redacted]";
        }
    }
}
