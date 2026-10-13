"""Owner-only release probe. Uses short-lived tokens; never prints credentials."""
import hashlib
import json
import secrets
import subprocess
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path


def sql(statement, monitoring=False):
    command = (["docker", "compose", "exec", "-T", "operations-database", "psql",
                "-X", "-U", "operations", "-d", "copilot_operations"] if monitoring else
               ["docker", "exec", "pgvector-postgres", "psql", "-X", "-U", "postgres",
                "-d", "interview_copilot"])
    result = subprocess.run(command + ["-At", "-v", "ON_ERROR_STOP=1", "-c", statement],
                            check=True, capture_output=True, text=True)
    return result.stdout.strip()


def request(path, token=None, body=None, method=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    call = urllib.request.Request("http://127.0.0.1:18081" + path, headers=headers,
                                  data=json.dumps(body).encode() if body is not None else None,
                                  method=method)
    try:
        with urllib.request.urlopen(call, timeout=8) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, None


def mint(actor, kind):
    token = secrets.token_urlsafe(32)
    digest = hashlib.sha256(token.encode()).hexdigest()
    sql("INSERT INTO auth_tokens(app_users_id,token_hash,expires_at,client_type) "
        f"VALUES({actor},'{digest}',LOCALTIMESTAMP+INTERVAL '10 minutes','{kind}')")
    return token, digest


def main():
    actor = sql("SELECT id FROM app_users u WHERE role='ADMIN' AND is_enabled "
                "AND NOT EXISTS(SELECT 1 FROM auth_tokens t WHERE t.app_users_id=u.id "
                "AND client_type='desktop' AND NOT is_revoked) ORDER BY id LIMIT 1")
    assert actor.isdigit(), "No isolated administrator identity available for release probe"
    hashes = []
    operation = str(uuid.uuid4())
    original = None
    report = {"realSupplierCalled": False, "checks": []}
    events = []
    try:
        admin, admin_hash = mint(actor, "admin")
        hashes.append(admin_hash)
        desktop, desktop_hash = mint(actor, "desktop")
        hashes.append(desktop_hash)
        assert request("/actuator/health")[1]["status"] == "UP"
        assert request("/api/v1/admin/operations/overview")[0] == 401
        assert request("/api/v1/telemetry/settings", admin)[0] == 403
        status, original = request("/api/v1/admin/operations/settings", admin)
        assert status == 200 and original["enabled"] is False
        gray = {**original, "enabled": True, "allowedUserIds": [actor]}
        assert request("/api/v1/admin/operations/settings", admin, gray, "PUT")[0] == 200
        assert request("/api/v1/telemetry/settings", desktop)[1]["enabled"] is True
        root = str(uuid.uuid4())
        for stage, elapsed in [("llm.first_content", 100), ("llm.complete", 200), ("answer.complete", 250)]:
            events.append({"eventId": str(uuid.uuid4()), "operationId": operation,
                           "spanId": root if stage == "answer.complete" else str(uuid.uuid4()),
                           "stage": stage, "source": "desktop", "providerType": "llm",
                           "durationMs": elapsed, "offsetMs": 0, "outcome": "success",
                           "startedAt": datetime.now(timezone.utc).isoformat(),
                           "model": "release-probe", "appVersion": "release-probe"})
        assert request("/api/v1/telemetry/operations", desktop, {"events": events})[0] == 202
        assert request("/api/v1/telemetry/operations", desktop, {"events": events})[0] == 202
        invalid = {**events[0], "question": "synthetic-forbidden-field"}
        assert request("/api/v1/telemetry/operations", desktop, {"events": [invalid]})[0] == 400
        invalid_count = {**events[0], "metadata": {"inputTokens": .5}}
        assert request("/api/v1/telemetry/operations", desktop, {"events": [invalid_count]})[0] == 400
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            rows = sql(f"SELECT count(*) FROM operations_events WHERE operation_id='{operation}'", True)
            if rows == "3":
                break
            time.sleep(.5)
        assert rows == "3", "Duplicate event persisted or background ingestion unavailable"
        for page in ["overview", "performance", "traces", "health"]:
            status, value = request("/api/v1/admin/operations/" + page, admin)
            assert status == 200
            report[page] = value
        status, detail = request(f"/api/v1/admin/operations/traces/{operation}?userId={actor}", admin)
        assert status == 200 and len(detail["events"]) == 3
        report["detail"] = detail
        report["checks"] = ["health UP", "unauthenticated admin denied", "admin token cannot ingest",
                            "default collection off", "gray configuration works", "event retry deduplicated",
                            "unknown fields rejected", "fractional counts rejected", "all four admin APIs", "trace drilldown"]
    finally:
        try:
            if original:
                status, current = request("/api/v1/admin/operations/settings", admin)
                if status == 200:
                    restored = {**original, "version": current["version"]}
                    assert request("/api/v1/admin/operations/settings", admin, restored, "PUT")[0] == 200
            # Synthetic data never remains in business or monitoring aggregates.
            sql(f"DELETE FROM operations_events WHERE operation_id='{operation}'; "
                f"DELETE FROM operations_answers WHERE operation_id='{operation}'; "
                "DELETE FROM operations_histograms WHERE NOT EXISTS(SELECT 1 FROM operations_events); "
                "DELETE FROM operations_answer_totals WHERE NOT EXISTS(SELECT 1 FROM operations_answers)", True)
            if events:
                ids = ",".join("'" + event["eventId"] + "'" for event in events)
                sql(f"DELETE FROM operations_event_ids WHERE event_id IN ({ids})", True)
        finally:
            if hashes:
                values = ",".join("'" + digest + "'" for digest in hashes)
                sql("UPDATE auth_tokens SET is_revoked=TRUE,revoked_reason='release_verification',"
                    f"revoked_at=LOCALTIMESTAMP WHERE token_hash IN ({values})")
    Path("releases/operations-verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({"checks": report["checks"], "collectionEnabled": False,
                      "realSupplierCalled": False}, ensure_ascii=False))


if __name__ == "__main__":
    main()
