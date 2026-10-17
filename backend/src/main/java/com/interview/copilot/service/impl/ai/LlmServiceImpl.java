package com.interview.copilot.service.impl.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.common.ai.LlmConcurrency;
import com.interview.copilot.common.ai.LlmStreamSession;
import com.interview.copilot.common.usage.UsageLease;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.exception.ai.ProviderErrors;
import com.interview.copilot.service.ai.LlmService;
import com.interview.copilot.service.platform.DesktopSettingsService;
import com.interview.copilot.service.platform.PlatformRuntimeService;
import com.interview.copilot.service.usage.UsageService;
import com.interview.copilot.util.ai.ProviderHttpClient;
import com.interview.copilot.util.ai.ProviderJson;
import com.interview.copilot.validation.ai.LlmRequestPolicy;

import org.springframework.stereotype.Service;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class LlmServiceImpl implements LlmService {
    private final DesktopSettingsService desktop;
    private final PlatformRuntimeService providers;
    private final ProviderHttpClient http;
    private final ProviderJson json;
    private final UsageService usage;
    private final LlmConcurrency concurrency;

    public LlmServiceImpl(
            PlatformRuntimeService providers,
            ProviderHttpClient http,
            ProviderJson json,
            UsageService usage,
            DesktopSettingsService desktop,
            LlmConcurrency concurrency) {
        this.desktop = desktop;
        this.concurrency = concurrency;
        this.providers = providers;
        this.http = http;
        this.json = json;
        this.usage = usage;
    }

    public Object execute(long userId,String requestId,JsonNode input) {return execute(userId,requestId,input,null);}

    public Object execute(long userId,String requestId,JsonNode input,
            com.interview.copilot.model.operations.OperationContext context) {
        try {return observedExecute(userId,requestId,input,context);}
        catch(RuntimeException error) {if(context!=null) context.finish("llm.complete",com.interview.copilot.common.operations.OperationOutcomes.from(error),Map.of());throw error;}
    }

    private Object observedExecute(long userId,String requestId,JsonNode input,
            com.interview.copilot.model.operations.OperationContext context) {
        if (!input.isObject() || (input.has("model") && !input.get("model").isTextual())) {
            throw ProviderErrors.invalid();
        }
        input = desktop.llm(userId, (ObjectNode) input);
        var selected =
                providers.snapshot().llm(input.has("model") ? input.get("model").asText() : null);
        ProviderProperties.Llm config = selected.config();
        ObjectNode routed = input.deepCopy();
        routed.put("model", config.getModel());
        Map<String, Object> body = LlmRequestPolicy.request(routed, config);
        LlmConcurrency.Permit permit = concurrency.acquire(userId, config.getMaxConcurrent());
        UsageLease lease;
        try {
            lease = reserve(userId, LlmRequestPolicy.requestId(requestId), config.getModel());
        } catch (RuntimeException exception) {
            permit.close();
            throw exception;
        }
        var observation=new com.interview.copilot.common.operations.LlmObservation(
                context==null?null:context.model(config.getModel()),json);
        if (Boolean.TRUE.equals(body.get("stream"))) {
            return new LlmStreamSession(lease,permit,config.getTotalTimeoutSeconds()*1000L,()->observation.finish("timeout"))
                    .start(observation.lifecycle(stream(config,body,observation)));
        }
        try {
            var result=single(config,body,lease,permit,observation);observation.single(result);return result;
        } catch(RuntimeException error) {observation.finish("error");throw error;}
    }

    private UsageLease reserve(long userId, String requestId, String model) {
        UsageLease lease = usage.start(userId, requestId, "llm");
        try {
            usage.describeModel(userId, requestId, "llm", model);
            return lease;
        } catch (RuntimeException error) {
            lease.fail();
            throw error;
        }
    }

    private Map<String, Object> single(
            ProviderProperties.Llm config,
            Map<String, Object> body,
            UsageLease lease,
            LlmConcurrency.Permit permit,com.interview.copilot.common.operations.LlmObservation observation) {
        try (permit;
                lease) {
            try {
                JsonNode response =
                        http.json(config, body, Duration.ofSeconds(config.getTotalTimeoutSeconds()))
                                .block();
                Map<String, Object> result = json.completion(response, "message");
                lease.complete();
                return result;
            } catch (RuntimeException exception) {
                lease.fail();
                observation.finish(com.interview.copilot.common.operations.OperationOutcomes.from(exception));
                throw ProviderErrors.failed();
            }
        }
    }

    Flux<String> stream(ProviderProperties.Llm config,Map<String,Object> body) {return stream(config,body,null);}
    Flux<String> stream(ProviderProperties.Llm config,Map<String,Object> body,
            com.interview.copilot.common.operations.LlmObservation observation) {
        AtomicInteger received = new AtomicInteger();
        AtomicInteger output = new AtomicInteger();
        AtomicBoolean done = new AtomicBoolean();
        return http.stream(config, body)
                .timeout(Duration.ofSeconds(config.getIdleTimeoutSeconds()))
                .takeUntilOther(
                        Mono.delay(Duration.ofSeconds(config.getTotalTimeoutSeconds()))
                                .flatMap(value -> {if(observation!=null) observation.finish("timeout");return Mono.error(ProviderErrors.failed());}))
                .filter(event -> event.data() != null && !event.data().isBlank())
                .map(event -> sanitize(event.data(),received,output,done,observation))
                .takeUntil("[DONE]"::equals)
                .concatWith(
                        Flux.defer(
                                () ->
                                        done.get()
                                                ? Flux.empty()
                                                : Flux.error(ProviderErrors.failed())))
                .doOnError(error -> {if(observation!=null) observation.finish(com.interview.copilot.common.operations.OperationOutcomes.from(error));})
                .onErrorMap(error -> ProviderErrors.failed());
    }

    private String sanitize(
            String data,AtomicInteger received,AtomicInteger output,AtomicBoolean done,com.interview.copilot.common.operations.LlmObservation observation) {
        if (received.addAndGet(data.length()) > 2 * 1024 * 1024) {
            throw ProviderErrors.failed();
        }
        if ("[DONE]".equals(data.trim())) {
            if (output.get() == 0) {
                throw ProviderErrors.failed();
            }
            done.set(true);
            return "[DONE]";
        }
        JsonNode input = json.parse(data);
        if(observation!=null) observation.inspect(input);
        int length =
                input.path("choices").path(0).path("delta").path("content").asText("").length();
        if (output.addAndGet(length) > 32768) {
            throw ProviderErrors.failed();
        }
        return json.encode(json.completion(input, "delta"));
    }
}
