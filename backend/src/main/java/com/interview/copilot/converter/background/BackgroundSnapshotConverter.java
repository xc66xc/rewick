package com.interview.copilot.converter.background;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.response.wallet.WalletResponse;
import com.interview.copilot.entity.background.BackgroundEntity;
import com.interview.copilot.validation.background.JobExperiencePolicy;
import java.time.ZoneId;

/** Pure mapping for frozen interview context; no persistence or session decisions. */
public final class BackgroundSnapshotConverter {
    private BackgroundSnapshotConverter() {}

    public static ObjectNode snapshot(ObjectMapper json, JsonNode environment, JsonNode resume, JsonNode target) {
        ObjectNode snapshot = json.createObjectNode();
        snapshot.set("context", json.createObjectNode()
                .put("name", resume.path("name").asText()).put("text", resume.path("text").asText()));
        ObjectNode jd = snapshot.putObject("interviewTarget");
        for (String field : new String[] {"companyName", "roleName", "jobDescription"})
            jd.put(field, target == null ? "" : target.path(field).asText());
        ObjectNode env = snapshot.putObject("interviewEnvironment");
        for (String field : new String[] {"id", "name", "interviewType", "resumeId", "targetId", "referenceIds"})
            env.set(field, environment.get(field));
        env.set(JobExperiencePolicy.FIELD, JobExperiencePolicy.value(environment));
        env.put("resumeName", resume.path("name").asText())
                .put("targetName", target == null ? "" : target.path("name").asText());
        return snapshot;
    }

    public static WalletResponse withBackground(WalletResponse value, JsonNode snapshot) {
        return new WalletResponse(value.availableSeconds(), value.version(), value.serverTime(), value.session(), snapshot);
    }

    public static ObjectNode detail(BackgroundEntity row, ObjectNode content) {
        if (content.has("interviewType") && !content.has(JobExperiencePolicy.FIELD))
            content.putNull(JobExperiencePolicy.FIELD);
        return content.put("id", row.id()).put("version", row.version()).put("bodyLoaded", true)
                .put("createdAt", row.createdAt().atZone(ZoneId.of("Asia/Shanghai")).toOffsetDateTime().toString())
                .put("updatedAt", row.updatedAt().atZone(ZoneId.of("Asia/Shanghai")).toOffsetDateTime().toString());
    }
}
