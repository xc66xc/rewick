FROM postgres:15.19-bookworm@sha256:5d1d70e254e3c5d7d76847a9deebb18478cd518df37abf6b278d4bdb1fe5d96c AS postgres

FROM postgres AS build
WORKDIR /build

# Extract the matching headers and PGXS without upgrading the database server
# or pulling in LLVM; this extension does not need LLVM bitcode.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl gcc make libc6-dev \
    && apt-get download "postgresql-server-dev-15=${PG_VERSION}" \
    && dpkg-deb -x postgresql-server-dev-15_*.deb / \
    && rm -f postgresql-server-dev-15_*.deb \
    && rm -rf /var/lib/apt/lists/*

RUN curl --fail --show-error --location --retry 3 \
        https://codeload.github.com/pgvector/pgvector/tar.gz/refs/tags/v0.8.6 \
        --output pgvector.tar.gz \
    && echo '10bf9938906e5d643bbc4a7eea104b6f57ba4898e5b76b20e60484ea1d5a7f8f  pgvector.tar.gz' | sha256sum --check --strict \
    && tar -xzf pgvector.tar.gz \
    && make -C pgvector-0.8.6 -j2 PG_CONFIG=/usr/lib/postgresql/15/bin/pg_config OPTFLAGS="" with_llvm=no \
    && make -C pgvector-0.8.6 install PG_CONFIG=/usr/lib/postgresql/15/bin/pg_config OPTFLAGS="" with_llvm=no DESTDIR=/opt/pgvector \
    && install -D -m 644 pgvector-0.8.6/LICENSE /opt/pgvector/usr/share/doc/pgvector/LICENSE

FROM postgres
LABEL org.opencontainers.image.title="Interview Copilot PostgreSQL" \
      org.opencontainers.image.version="15.19-pgvector0.8.6"
COPY --from=build /opt/pgvector/usr/lib/postgresql/15/lib/vector.so /usr/lib/postgresql/15/lib/vector.so
COPY --from=build /opt/pgvector/usr/share/postgresql/15/extension/ /usr/share/postgresql/15/extension/
COPY --from=build /opt/pgvector/usr/share/doc/pgvector/LICENSE /usr/share/doc/pgvector/LICENSE
RUN postgres --version | grep -E '^postgres \(PostgreSQL\) 15\.19( |$)'
