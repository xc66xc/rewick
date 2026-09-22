package com.interview.copilot.service.background;

import java.util.List;

public interface HotwordExtractionService {
    List<String> extract(long user, String resumeId, String targetId, List<String> referenceIds);
}
