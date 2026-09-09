package com.interview.copilot.asr;

import com.interview.copilot.ai.ProviderErrors;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.web.util.UriComponentsBuilder;
import org.springframework.web.util.UriUtils;

final class AsrServiceSelection {
    private AsrServiceSelection() { }

    static String from(URI uri) {
        if (uri == null) { return null; }
        List<String> values = UriComponentsBuilder.fromUri(uri).build().getQueryParams().get("serviceId");
        if (values == null) { return null; }
        if (values.size() != 1 || values.getFirst() == null) { throw ProviderErrors.invalid(); }
        try {
            String value = UriUtils.decode(values.getFirst(), StandardCharsets.UTF_8);
            if (!value.matches("[A-Za-z0-9_.-]{1,64}")) { throw ProviderErrors.invalid(); }
            return value;
        } catch (IllegalArgumentException error) { throw ProviderErrors.invalid(); }
    }
}
