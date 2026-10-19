package com.interview.copilot.service.references;

import com.interview.copilot.model.references.ReferenceModels;
import java.util.List;

public interface ReferenceJobService {
    ReferenceModels.Job claim();
    boolean renew(ReferenceModels.Job job);
    void indexing(ReferenceModels.Job job);
    boolean prepare(ReferenceModels.Job job, ReferenceModels.Parsed parsed);
    boolean stage(ReferenceModels.Job job, List<ReferenceModels.Chunk> chunks, List<List<Double>> vectors, String fingerprint);
    boolean stageQuestions(ReferenceModels.Job job, List<ReferenceModels.Section> questions, List<List<Double>> vectors, String fingerprint);
    void publish(ReferenceModels.Job job, ReferenceModels.Parsed parsed, String fingerprint);
    void fail(ReferenceModels.Job job, String error);
    void cleanup();
}
