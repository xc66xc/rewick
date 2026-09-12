package com.interview.copilot.service.references;

import com.interview.copilot.model.references.ReferenceModels;

import java.util.List;

public interface ReferenceJobService {
    ReferenceModels.Job claim();

    boolean renew(ReferenceModels.Job job);

    void indexing(ReferenceModels.Job job);

    void publish(
            ReferenceModels.Job job,
            ReferenceModels.Parsed parsed,
            List<List<Double>> vectors,
            String fingerprint);

    void fail(ReferenceModels.Job job, String error);
}
