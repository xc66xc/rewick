package com.interview.copilot.request.questions;

import java.util.List;

public record QuestionRewriteRequest(String question, List<String> context) {}
