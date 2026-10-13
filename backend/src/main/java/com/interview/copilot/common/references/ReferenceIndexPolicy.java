package com.interview.copilot.common.references;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.model.references.ReferenceModels;

/** Each index job decodes its immutable database policy snapshot. */
public final class ReferenceIndexPolicy {
    private static final ObjectMapper JSON = new ObjectMapper().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    private ReferenceIndexPolicy() {}
    public static ReferencePolicy read(ReferenceModels.Job job) {
        try {
            var policy = JSON.readValue(job.policyJson(), ReferencePolicy.class);
            if (policy.childTarget() < 100 || policy.parentTarget() < policy.childTarget()
                    || policy.childOverlap() >= policy.childTarget() || policy.maxChunks() < 1) {
                throw new IllegalStateException("资料构建策略无效，请创建新索引任务。");
            }
            return policy;
        }
        catch (com.fasterxml.jackson.core.JsonProcessingException error) { throw new IllegalStateException("资料构建策略无效。", error); }
    }
}
