package com.interview.copilot.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.lang.reflect.Modifier;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;

public class BackendArchitectureTest {
    private static final Path ROOT = Path.of("src/main/java/com/interview/copilot");
    private static final Set<String> ROLES =
            Set.of(
                    "controller",
                    "service",
                    "mapper",
                    "entity",
                    "model",
                    "dto",
                    "vo",
                    "request",
                    "response",
                    "config",
                    "security",
                    "exception",
                    "util",
                    "constant",
                    "converter",
                    "validation",
                    "job",
                    "event",
                    "common");

    @Test
    void packages_followResponsibilityFirstLayout() throws IOException {
        for (Path source : sources()) {
            Path relative = ROOT.relativize(source);
            if (relative.getNameCount() == 1) {
                assertThat(source.getFileName().toString()).isEqualTo("CopilotApplication.java");
            } else {
                assertThat(ROLES).contains(relative.getName(0).toString());
            }
        }
    }

    @Test
    void controllers_dependOnlyOnServiceInterfaces() throws Exception {
        for (Path source : sources()) {
            if (!source.startsWith(ROOT.resolve("controller"))) {
                continue;
            }
            Class<?> type = load(source);
            for (var field : type.getDeclaredFields()) {
                if (Modifier.isStatic(field.getModifiers())) {
                    continue;
                }
                assertThat(field.getType().isInterface()).as(field.toString()).isTrue();
                assertThat(field.getType().getPackageName())
                        .startsWith("com.interview.copilot.service.");
                assertThat(Modifier.isFinal(field.getModifiers())).as(field.toString()).isTrue();
            }
        }
    }

    @Test
    void services_keepInterfacesSeparateFromImplementations() throws Exception {
        for (Path source : sources()) {
            if (!source.startsWith(ROOT.resolve("service"))) {
                continue;
            }
            Class<?> type = load(source);
            if (source.startsWith(ROOT.resolve("service/impl"))) {
                assertThat(type.getSimpleName()).endsWith("ServiceImpl");
                assertThat(type.getInterfaces()).isNotEmpty();
            } else {
                assertThat(type.isInterface()).as(type.getName()).isTrue();
            }
        }
    }

    @Test
    void persistence_usesMappersWithoutJdbcOrJpaInProduction() throws IOException {
        for (Path source : sources()) {
            String code = Files.readString(source);
            assertThat(code)
                    .as(source.toString())
                    .doesNotContain(
                            "org.springframework.jdbc.",
                            "java.sql.",
                            "jakarta.persistence.",
                            "org.springframework.data.jpa.");
            if (!source.startsWith(ROOT.resolve("mapper"))) {
                assertThat(code)
                        .as(source.toString())
                        .doesNotContain("org.apache.ibatis.annotations.Select;", "org.apache.ibatis.annotations.Insert;",
                                "org.apache.ibatis.annotations.Update;", "org.apache.ibatis.annotations.Delete;");
            }
        }
    }

    private List<Path> sources() throws IOException {
        try (var files = Files.walk(ROOT)) {
            return files.filter(path -> path.toString().endsWith(".java")).toList();
        }
    }

    private Class<?> load(Path source) throws ClassNotFoundException {
        String name = ROOT.relativize(source).toString().replace('/', '.').replace(".java", "");
        return Class.forName("com.interview.copilot." + name);
    }
}
