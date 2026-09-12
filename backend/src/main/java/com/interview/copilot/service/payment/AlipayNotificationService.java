package com.interview.copilot.service.payment;

import java.util.List;
import java.util.Map;

public interface AlipayNotificationService {
    void notify(Map<String, List<String>> parameters);
}
