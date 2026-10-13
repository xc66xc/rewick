package com.interview.copilot.common.operations;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.config.OperationsProperties;
import org.springframework.stereotype.Component;
import jakarta.annotation.PreDestroy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Fixed, low-cardinality range queries; admin input never becomes PromQL. */
@Component
public final class OperationsPrometheus {
    private static final String P95="histogram_quantile(0.95, sum(increase(operations_stage_duration_seconds_bucket{stage=\"llm.first_content\",outcome=\"success\",source=\"desktop\"}[1h])) by (le))";
    private static final String COUNT="sum(increase(operations_stage_duration_seconds_count{stage=\"llm.first_content\",outcome=\"success\",source=\"desktop\"}[1h]))";
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1)).build();
    private final OperationsProperties properties;
    private final ObjectMapper json;
    public OperationsPrometheus(OperationsProperties properties,ObjectMapper json) {this.properties=properties;this.json=json;}
    public List<Map<String,Object>> trend(int hours) {
        if(hours<1 || hours>2160) return null;
        try {
            long end=Instant.now().getEpochSecond();long start=end-hours*3600L;long step=Math.max(3600,hours*3600L/1000);
            var quantiles=values(query(P95,start,end,step));var counts=values(query(COUNT,start,end,step));
            String source="desktop";
            if(quantiles.isEmpty()) {
                source="backend";quantiles=values(query(P95.replace("desktop","backend"),start,end,step));
                counts=values(query(COUNT.replace("desktop","backend"),start,end,step));
            }
            final String timingSource=source;final var sampleCounts=counts;
            if(quantiles.isEmpty()) return null;
            var rows=new ArrayList<Map<String,Object>>();
            quantiles.forEach((at,value) -> {if(sampleCounts.containsKey(at)) rows.add(Map.of("at",Instant.ofEpochSecond(at).toString(),
                    "count",Math.max(0,Math.round(sampleCounts.get(at))),"p95Ms",value*1000,"source",timingSource));});
            return rows.isEmpty()?null:List.copyOf(rows);
        } catch(java.io.IOException | InterruptedException | RuntimeException error) {
            if(error instanceof InterruptedException) Thread.currentThread().interrupt();return null;
        }
    }
    private JsonNode query(String expression,long start,long end,long step) throws java.io.IOException,InterruptedException {
        String encoded=java.net.URLEncoder.encode(expression,java.nio.charset.StandardCharsets.UTF_8);
        var uri=URI.create(properties.prometheusUrl()+"/api/v1/query_range?query="+encoded+"&start="+start+"&end="+end+"&step="+step);
        var response=http.send(HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(1)).GET().build(),HttpResponse.BodyHandlers.ofString());
        if(response.statusCode()!=200 || response.body().length()>256*1024) throw new IllegalStateException("Prometheus unavailable");
        JsonNode result=json.readTree(response.body());if(!"success".equals(result.path("status").asText())) throw new IllegalStateException("Prometheus unavailable");
        return result;
    }
    private Map<Long,Double> values(JsonNode response) {
        var result=new LinkedHashMap<Long,Double>();
        for(var series:response.path("data").path("result")) for(var point:series.path("values")) {
            if(point.isArray() && point.size()==2) {
                double value=Double.parseDouble(point.get(1).asText());
                if(Double.isFinite(value) && value>=0) result.put(point.get(0).asLong(),value);
            }
        }
        return result;
    }
    @PreDestroy public void close() {http.shutdownNow();}
}
