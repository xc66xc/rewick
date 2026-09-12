package com.interview.copilot.common.payment;

import com.github.dockerjava.api.command.InspectContainerResponse;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import org.testcontainers.utility.MountableFile;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

final class PaymentDatabase extends PostgreSQLContainer<PaymentDatabase> {
    PaymentDatabase() {
        super(DockerImageName.parse("interview-copilot-postgres:15.19-pgvector0.8.6")
                .asCompatibleSubstituteFor("postgres"));
        withCopyFileToContainer(MountableFile.forHostPath(Path.of("sql")), "/tmp/sql");
    }

    @Override
    protected void containerIsStarted(InspectContainerResponse info) {
        var command = new ArrayList<>(List.of("psql", "-X", "-v", "ON_ERROR_STOP=1",
                "-U", getUsername(), "-d", getDatabaseName()));
        for (String script : List.of("01_schema.sql", "02_pgvector.sql", "03_admin_users.sql",
                "04_platform_config.sql", "05_email_auth.sql", "06_display_name.sql",
                "07_email_code_purpose.sql", "08_server_local_time.sql", "09_pg_references.sql",
                "10_time_wallet.sql", "11_payment_packages.sql", "12_alipay_payments.sql", "13_session_records.sql", "14_server_background.sql")) {
            command.add("-f");
            command.add("/tmp/sql/" + script);
        }
        try {
            var result = execInContainer(command.toArray(String[]::new));
            if (result.getExitCode() != 0) throw new IllegalStateException(result.getStderr());
        } catch (Exception error) {
            throw new IllegalStateException("Payment test database setup failed", error);
        }
    }
}
