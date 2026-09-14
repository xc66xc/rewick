ARG BUILD_IMAGE=eclipse-temurin:21-jdk
ARG RUNTIME_IMAGE=eclipse-temurin:21-jre
FROM ${BUILD_IMAGE} AS build
WORKDIR /build
# Keep the wrapper on its checksum-pinned ZIP instead of its tar.gz fallback.
RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/*
COPY .mvn .mvn
COPY mvnw pom.xml ./
COPY src src
RUN --mount=type=cache,target=/root/.m2,sharing=locked chmod +x mvnw && ./mvnw -B package -DskipTests

FROM ${RUNTIME_IMAGE}
WORKDIR /app
RUN groupadd --system copilot && useradd --system --gid copilot copilot
RUN mkdir -p /app/data/references /app/data/client-downloads && chown copilot:copilot /app/data/references /app/data/client-downloads
COPY --from=build /build/target/*.jar /app/backend.jar
USER copilot
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/backend.jar"]
