#!/usr/bin/env bash
set -euo pipefail
# Run in the server deploy directory after uploading compose.operations.yaml and
# prometheus.operations.yml. Secrets are generated on the server and never printed.
umask 077
test -f compose.yaml
test -f .env
test -f compose.operations.yaml
test -f prometheus.operations.yml
mkdir -p config
chmod 700 config
if [[ ! -f .operations-database.env && ! -f .operations-backend.env ]]; then
  operations_password=$(openssl rand -hex 32)
  operations_metrics_token=$(openssl rand -hex 32)
  cat > .operations-database.env <<EOF
POSTGRES_USER=operations
POSTGRES_DB=copilot_operations
POSTGRES_PASSWORD=${operations_password}
EOF
  cat > .operations-backend.env <<EOF
COPILOT_OPERATIONS_DATABASE_URL=jdbc:postgresql://operations-database:5432/copilot_operations
COPILOT_OPERATIONS_DATABASE_USERNAME=operations
COPILOT_OPERATIONS_DATABASE_PASSWORD=${operations_password}
COPILOT_OPERATIONS_METRICS_TOKEN=${operations_metrics_token}
COPILOT_OPERATIONS_PROMETHEUS_URL=http://operations-prometheus:9090
EOF
  printf '%s' "$operations_metrics_token" > config/operations-metrics-token
  unset operations_password operations_metrics_token
fi
test -s .operations-database.env
test -s .operations-backend.env
test -s config/operations-metrics-token
chmod 600 .operations-database.env .operations-backend.env
# The Prometheus container's unprivileged UID needs to read this single bind mount;
# the containing host directory stays owner-only.
chmod 644 config/operations-metrics-token
if [[ -f compose.override.yaml ]] && ! cmp -s compose.operations.yaml compose.override.yaml; then
  printf '%s\n' 'Existing Compose override differs; merge it before continuing.' >&2
  exit 1
fi
cp compose.operations.yaml compose.override.yaml
docker compose config --quiet
docker compose up -d --wait operations-database operations-prometheus
docker compose ps operations-database operations-prometheus
