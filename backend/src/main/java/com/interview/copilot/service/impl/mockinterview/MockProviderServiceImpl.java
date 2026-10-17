package com.interview.copilot.service.impl.mockinterview;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.common.ai.LlmConcurrency;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.service.mockinterview.MockProviderService;
import com.interview.copilot.service.platform.PlatformRuntimeService;
import com.interview.copilot.util.ai.ProviderHttpClient;
import com.interview.copilot.util.ai.ProviderJson;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** Server-owned interview prompts, isolated from desktop answer preferences and assist billing. */
@Service
public class MockProviderServiceImpl implements MockProviderService {
    private final PlatformRuntimeService runtime;
    private final ProviderHttpClient http;
    private final ProviderJson json;
    private final LlmConcurrency concurrency;
    private final io.micrometer.core.instrument.MeterRegistry meters;
    public MockProviderServiceImpl(PlatformRuntimeService runtime, ProviderHttpClient http, ProviderJson json, LlmConcurrency concurrency, io.micrometer.core.instrument.MeterRegistry meters) {
        this.runtime=runtime;this.http=http;this.json=json;this.concurrency=concurrency;this.meters=meters;
    }
    public JsonNode completion(long userId,String modelId,String systemPrompt,JsonNode context,int maxTokens) {
        var selection=runtime.snapshot().llm(modelId);
        var endpoint=selection.config();
        int tokens=Math.min(endpoint.getMaxOutputTokens(),Math.clamp(maxTokens,64,8192));
        if(context.toString().length()>160000 || systemPrompt.length()>20000)throw invalid();
        try(var permit=concurrency.acquire(userId,endpoint.getMaxConcurrent())) {
            JsonNode response=http.json(endpoint,Map.of("model",endpoint.getModel(),"stream",false,"temperature",0.4,
                    "max_tokens",tokens,"messages",List.of(Map.of("role","system","content",systemPrompt),
                    Map.of("role","user","content",context.toString()))),Duration.ofSeconds(Math.min(60,endpoint.getTotalTimeoutSeconds())))
                    .block(Duration.ofSeconds(65));
            if(response==null)throw invalid();
            recordUsage(response.path("usage"));
            String content=response.path("choices").path(0).path("message").path("content").asText();
            if(content.startsWith("```")) {
                int start=content.indexOf('\n');int end=content.lastIndexOf("```");
                if(start<0||end<=start)throw invalid();content=content.substring(start+1,end).trim();
            }
            if(content.length()>64000)throw invalid();
            JsonNode result=json.parse(content);
            if(!result.isObject())throw invalid();
            return result;
        }
    }
    private void recordUsage(JsonNode usage) {
        boolean known=java.util.stream.Stream.of("prompt_tokens","completion_tokens","total_tokens")
                .allMatch(field->usage.path(field).isIntegralNumber()&&usage.path(field).canConvertToLong()
                        &&usage.path(field).asLong()>=0&&usage.path(field).asLong()<=1_000_000_000L);
        meters.counter("copilot.mock.llm.responses","usage",known?"reported":"unknown").increment();
        if(known)for(String field:java.util.List.of("prompt_tokens","completion_tokens","total_tokens"))
            meters.counter("copilot.mock.llm.tokens","type",field).increment(usage.path(field).asLong());
    }
    private static ApiException invalid(){return new ApiException(HttpStatus.BAD_GATEWAY,"MOCK_PROVIDER_RESPONSE","面试模型返回内容不符合格式，请暂停后重试。");}
}
