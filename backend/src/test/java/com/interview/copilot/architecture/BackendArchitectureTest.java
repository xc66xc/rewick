package com.interview.copilot.architecture;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.lang.reflect.Modifier;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
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
    private static final Set<String> MODULE_ROLES = Set.of(
            "controller", "service", "mapper", "entity", "model", "dto", "vo",
            "request", "response", "converter", "validation", "job", "event");

    @Test
    void packages_followResponsibilityFirstLayout() throws IOException {
        for (Path source : sources()) {
            Path relative = ROOT.relativize(source);
            if (relative.getNameCount() == 1) {
                assertThat(source.getFileName().toString()).isEqualTo("CopilotApplication.java");
            } else {
                assertThat(ROLES).contains(relative.getName(0).toString());
                if (MODULE_ROLES.contains(relative.getName(0).toString())) {
                    int moduleIndex = relative.startsWith(Path.of("service", "impl")) ? 2 : 1;
                    assertThat(relative.getNameCount()).as(source.toString()).isEqualTo(moduleIndex + 2);
                    assertThat(relative.getName(moduleIndex).toString()).matches("[a-z][a-z0-9]*");
                }
            }
            String expectedPackage = "com.interview.copilot"
                    + (relative.getParent() == null ? "" : "." + relative.getParent().toString().replace('/', '.'));
            assertThat(Files.readString(source)).startsWith("package " + expectedPackage + ";");
        }
    }

    @Test
    void mappers_exposePersistenceContractsWithoutBusinessOrHttpDependencies() throws Exception {
        for (Path source : sources()) {
            if (!source.startsWith(ROOT.resolve("mapper"))) {
                continue;
            }
            Class<?> type = load(source);
            assertThat(type.isInterface()).as(type.getName()).isTrue();
            assertThat(type.isAnnotationPresent(org.apache.ibatis.annotations.Mapper.class)).isTrue();
            assertThat(type.getDeclaredClasses()).as(type.getName()).isEmpty();
            for (var method : type.getDeclaredMethods()) {
                assertThat(method.isDefault()).as(method.toString()).isFalse();
            }
            assertThat(Files.readString(source)).as(source.toString()).doesNotContain(
                    "com.interview.copilot.controller.", "com.interview.copilot.service.",
                    "com.interview.copilot.request.", "com.interview.copilot.response.",
                    "com.interview.copilot.vo.", "com.interview.copilot.security.",
                    "com.interview.copilot.exception.", "org.springframework.http.");
        }
    }

    @Test
    void layers_doNotDependOnServiceImplementationsOrMapperOwnedTypes() throws IOException {
        for (Path source : sources()) {
            String code = Files.readString(source);
            assertThat(code).as(source.toString())
                    .doesNotContain("import com.interview.copilot.service.impl.");
            if (source.startsWith(ROOT.resolve("service"))) {
                assertThat(code).as(source.toString()).doesNotContain("com.interview.copilot.vo.");
            }
            if (source.startsWith(ROOT.resolve("converter")) || source.startsWith(ROOT.resolve("job"))) {
                assertThat(code).as(source.toString()).doesNotContain("com.interview.copilot.mapper.");
            }
        }
    }

    @Test
    void controllerPayloads_doNotExposeEntitiesIncludingNestedRecords() throws Exception {
        for (Path source : sources()) {
            if (!source.startsWith(ROOT.resolve("controller"))) {
                continue;
            }
            for (var method : load(source).getDeclaredMethods()) {
                assertPayload(method.getGenericReturnType(), new HashSet<>());
                for (Type parameter : method.getGenericParameterTypes()) {
                    assertPayload(parameter, new HashSet<>());
                }
            }
        }
    }

    private void assertPayload(Type type, Set<Type> visited) {
        if (!visited.add(type)) {
            return;
        }
        if (type instanceof ParameterizedType parameterized) {
            assertPayload(parameterized.getRawType(), visited);
            for (Type argument : parameterized.getActualTypeArguments()) {
                assertPayload(argument, visited);
            }
        } else if (type instanceof Class<?> value) {
            assertThat(value.getPackageName()).as(value.getName())
                    .doesNotStartWith("com.interview.copilot.entity.")
                    .doesNotStartWith("com.interview.copilot.mapper.");
            if (value.isRecord()) {
                for (var component : value.getRecordComponents()) {
                    assertPayload(component.getGenericType(), visited);
                }
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
