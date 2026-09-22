package com.interview.copilot.service.background;

import java.util.List;

public interface HotwordSourceService {
    String read(long user, String resumeId, String targetId, List<String> referenceIds);
}
