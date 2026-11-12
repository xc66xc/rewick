package com.interview.copilot.service.questions;

import com.interview.copilot.common.questions.QuestionRewriteWork;
import java.util.Optional;

public interface QuestionRewriteCancellationService {
    Optional<QuestionRewriteWork> register(long user, String requestId);
    void cancel(long user, String requestId);
}
