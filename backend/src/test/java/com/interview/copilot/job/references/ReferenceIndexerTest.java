package com.interview.copilot.job.references;

import com.interview.copilot.common.references.PlatformEmbeddingClient;
import com.interview.copilot.common.references.ReferenceFiles;
import com.interview.copilot.common.references.ReferenceParser;
import com.interview.copilot.config.ProviderProperties;
import com.interview.copilot.response.references.ReferenceDocumentResponse;
import com.interview.copilot.exception.ai.ProviderFailure;
import com.interview.copilot.model.references.ReferenceModels;
import com.interview.copilot.service.references.ReferenceJobService;
import com.interview.copilot.service.references.ReferenceStorageService;
import org.junit.jupiter.api.Test;
import java.nio.file.Path;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class ReferenceIndexerTest {
    @Test void process_embeddingRejected_persistsSafeActionableErrorWithoutPublishing() throws Exception {
        var jobs=mock(ReferenceJobService.class);
        var repository=mock(ReferenceStorageService.class);
        var files=mock(ReferenceFiles.class);
        var parser=mock(ReferenceParser.class);
        var embedding=mock(PlatformEmbeddingClient.class);
        var job=new ReferenceModels.Job(1,"doc",7,1,"token","{\"child_target\":600,\"parent_target\":1400,\"child_overlap\":100,\"max_chunks\":200}");
        var document=new ReferenceDocumentResponse("doc","test.md","technical",true,"pending","hash",0,"","","",0,0,0,"","",0,"pending","");
        var parsed=new ReferenceModels.Parsed(List.of(),List.of(),List.of(new ReferenceModels.Chunk(0,0,"synthetic",1,1)),"md","headings");
        var selection=new PlatformEmbeddingClient.Selection(new ProviderProperties.Embedding(),"fingerprint");
        when(repository.require(7,"doc")).thenReturn(document);
        when(files.path("doc")).thenReturn(Path.of("test.md"));
        when(parser.parse(any(),eq("test.md"),any())).thenReturn(parsed);
        when(embedding.selection()).thenReturn(selection);
        when(jobs.prepare(job,parsed)).thenReturn(true);
        when(jobs.renew(job)).thenReturn(true);
        when(embedding.embed(selection,List.of("synthetic"))).thenThrow(ProviderFailure.http(401));

        new ReferenceIndexer(jobs,repository,files,parser,embedding).process(job);

        verify(jobs).fail(eq(job),contains("HTTP 401"));
        verify(jobs,never()).stage(any(),any(),any(),any());
        verify(jobs,never()).publish(any(),any(),any());
    }
}
