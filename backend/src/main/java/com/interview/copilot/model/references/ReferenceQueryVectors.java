package com.interview.copilot.model.references;

import java.util.List;

public record ReferenceQueryVectors(String fingerprint, List<List<Double>> vectors) {
    public ReferenceQueryVectors { vectors = vectors.stream().map(List::copyOf).toList(); }
}
