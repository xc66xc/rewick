package com.interview.copilot.references;

import com.github.dockerjava.api.command.InspectContainerResponse;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import org.testcontainers.utility.MountableFile;

final class ReferenceDatabase extends PostgreSQLContainer<ReferenceDatabase> {
    private static final List<String> SCRIPTS=List.of("01_schema.sql","02_pgvector.sql","03_admin_users.sql","04_platform_config.sql",
            "05_email_auth.sql","06_display_name.sql","07_email_code_purpose.sql","08_server_local_time.sql","09_pg_references.sql");
    ReferenceDatabase() {
        super(DockerImageName.parse("interview-copilot-postgres:15.19-pgvector0.8.6").asCompatibleSubstituteFor("postgres"));
        for(String script:SCRIPTS) withCopyFileToContainer(MountableFile.forHostPath(Path.of("sql",script)),"/tmp/"+script);
    }
    @Override protected void containerIsStarted(InspectContainerResponse ignored) {
        var args=new ArrayList<>(List.of("psql","-v","ON_ERROR_STOP=1","--single-transaction","-U",getUsername(),"-d",getDatabaseName()));
        for(String script:SCRIPTS) { args.add("-f"); args.add("/tmp/"+script); }
        try {
            var result=execInContainer(args.toArray(String[]::new));
            if(result.getExitCode()!=0) throw new IllegalStateException(result.getStderr());
        } catch(Exception error) { throw new IllegalStateException("Reference database setup failed",error); }
    }
}
