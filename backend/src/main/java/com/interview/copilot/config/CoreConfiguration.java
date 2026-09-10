package com.interview.copilot.config;

import com.interview.copilot.common.ServerTime;
import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
public class CoreConfiguration {
    @Bean
    Clock clock() { return Clock.system(ServerTime.ZONE); }

    @Bean
    PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }
}
