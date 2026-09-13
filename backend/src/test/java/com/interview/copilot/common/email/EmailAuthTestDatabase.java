package com.interview.copilot.common.email;

import com.github.dockerjava.api.command.InspectContainerResponse;

import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import org.testcontainers.utility.MountableFile;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

public final class EmailAuthTestDatabase extends PostgreSQLContainer<EmailAuthTestDatabase> {
    private static final List<String> SCRIPTS =
            List.of(
                    "01_schema.sql",
                    "02_pgvector.sql",
                    "03_admin_users.sql",
                    "04_platform_config.sql",
                    "05_email_auth.sql",
                    "06_display_name.sql",
                    "07_email_code_purpose.sql",
                    "08_server_local_time.sql",
                    "09_pg_references.sql",
                    "10_time_wallet.sql",
                    "16_desktop_sessions.sql",
                    "17_desktop_settings.sql");

    public EmailAuthTestDatabase() {
        super(
                DockerImageName.parse("interview-copilot-postgres:15.19-pgvector0.8.6")
                        .asCompatibleSubstituteFor("postgres"));
        for (String file : SCRIPTS)
            withCopyFileToContainer(
                    MountableFile.forHostPath(Path.of("sql", file)), "/tmp/" + file);
    }

    @Override
    protected void containerIsStarted(InspectContainerResponse containerInfo) {
        List<String> arguments =
                new ArrayList<>(
                        List.of(
                                "psql",
                                "-v",
                                "ON_ERROR_STOP=1",
                                "--single-transaction",
                                "-U",
                                getUsername(),
                                "-d",
                                getDatabaseName()));
        for (String file : SCRIPTS) {
            arguments.add("-f");
            arguments.add("/tmp/" + file);
        }
        try {
            var result = execInContainer(arguments.toArray(String[]::new));
            if (result.getExitCode() != 0)
                throw new IllegalStateException(
                        "Email test SQL initialization failed: " + result.getStderr());
        } catch (IOException error) {
            throw new IllegalStateException("Test database initialization failed.", error);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Test database initialization interrupted.", error);
        }
    }
}
