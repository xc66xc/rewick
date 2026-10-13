package com.interview.copilot.service.impl.references;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import org.junit.jupiter.api.Test;

class ReferenceCancellationServiceTest {
    @Test void cancel_otherUser_doesNotInterruptOwner() {
        var service=new ReferenceCancellationServiceImpl();
        try(var work=service.register(1,"one")) {
            service.cancel(2,"one");
            assertThat(Thread.currentThread().isInterrupted()).isFalse();
            service.cancel(1,"one");
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
        }
        assertThat(Thread.currentThread().isInterrupted()).isFalse();
    }
    @Test void cancel_beforeRegistration_preventsStartingLateWork() {
        var service=new ReferenceCancellationServiceImpl();
        service.cancel(1,"early");
        assertThatThrownBy(() -> service.register(1,"early")).isInstanceOf(java.util.concurrent.CancellationException.class);
    }
    @Test void cancel_completedRequest_doesNotInterruptThreadReusedForNewRequest() {
        var service=new ReferenceCancellationServiceImpl();
        service.register(1,"old").close();
        try(var work=service.register(1,"new")) {
            service.cancel(1,"old");
            assertThat(Thread.currentThread().isInterrupted()).isFalse();
        }
    }
    @Test void register_boundedSlots_andIdempotentRelease() {
        var service=new ReferenceCancellationServiceImpl();
        var all=new java.util.ArrayList<com.interview.copilot.common.references.ReferenceWork>();
        for(int i=0;i<32;i++) all.add(service.register(1,"request"+i));
        assertThatThrownBy(() -> service.register(1,"overflow")).isInstanceOf(com.interview.copilot.exception.ApiException.class);
        all.getFirst().close();all.getFirst().close();
        try(var extra=service.register(1,"allowed")) {
            assertThatThrownBy(() -> service.register(1,"another")).isInstanceOf(com.interview.copilot.exception.ApiException.class);
        }
        all.forEach(com.interview.copilot.common.references.ReferenceWork::close);
    }
}
