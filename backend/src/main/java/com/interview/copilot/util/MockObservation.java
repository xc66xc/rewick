package com.interview.copilot.util;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

/** Only caller-controlled fixed stage names and finite outcomes become metric labels. */
@Component
public final class MockObservation {
 private final MeterRegistry meters;
 public MockObservation(MeterRegistry meters) {this.meters=meters;}
 public <T> T measure(String stage,Supplier<T> work) {
  long started=System.nanoTime();String outcome="success";
  try {return work.get();}
  catch(RuntimeException error) {outcome=Thread.currentThread().isInterrupted() || error instanceof java.util.concurrent.CancellationException?"cancelled":"error";throw error;}
  finally {meters.timer("copilot.mock.stage","stage",stage,"outcome",outcome).record(System.nanoTime()-started,TimeUnit.NANOSECONDS);}
 }
}
