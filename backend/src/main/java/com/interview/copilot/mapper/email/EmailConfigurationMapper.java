package com.interview.copilot.mapper.email;

import com.interview.copilot.dto.email.EmailConfiguration;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface EmailConfigurationMapper {
    @Select(
            """
SELECT version, is_enabled AS enabled, host, port, username, encrypted_password,
    from_address, is_start_tls AS start_tls, is_ssl AS ssl FROM email_config WHERE id = 1
""")
    Stored read();

    @Update(
            """
UPDATE email_config SET version = version + 1, is_enabled = #{config.enabled}, host = #{config.host},
    port = #{config.port}, username = #{config.username}, encrypted_password = #{encrypted},
    from_address = #{config.from}, is_start_tls = #{config.startTls}, is_ssl = #{config.ssl}, updated_at = LOCALTIMESTAMP(6)
WHERE id = 1 AND version = #{config.version}
""")
    int publish(@Param("config") EmailConfiguration config, @Param("encrypted") String encrypted);

    record Stored(
            long version,
            boolean enabled,
            String host,
            int port,
            String username,
            String encryptedPassword,
            String fromAddress,
            boolean startTls,
            boolean ssl) {
        @Override
        public String toString() {
            return "StoredEmailConfiguration[version=" + version + "]";
        }
    }
}
