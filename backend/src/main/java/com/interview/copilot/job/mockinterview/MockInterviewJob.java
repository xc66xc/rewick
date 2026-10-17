package com.interview.copilot.job.mockinterview;

import com.interview.copilot.service.mockinterview.MockInterviewService;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class MockInterviewJob {
 private final MockInterviewService interviews;
 public MockInterviewJob(MockInterviewService interviews) {this.interviews=interviews;}
 @Scheduled(fixedDelay=5000) public void expire() {interviews.expire();}
}
