package com.interview.copilot.service.mockinterview;

public interface MockMeterService {
 java.time.LocalDateTime now();
 void lock(long user);
 void start(long user,String id,long remaining);
 void settle(long user,String id);
 void stop(long user,String id);
 void heartbeat(long user,String id);
}
