package com.interview.copilot.service.impl.references;

import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import com.interview.copilot.entity.references.ReferenceScopeEntity;
import com.interview.copilot.mapper.references.ReferenceHybridMapper;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import java.util.List;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.TimeUnit;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ReferenceVectorServiceTest {
    @Test void search_bothQueriesRunConcurrentlyWithIndependentThresholds_andShareVector() {
        var mapper=mock(ReferenceHybridMapper.class);
        var manager=mock(PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenAnswer(ignored -> new SimpleTransactionStatus());
        var scope=List.of(new ReferenceScopeEntity("doc",1,"qa","technical"));
        var barrier=new CyclicBarrier(2);
        var candidate=new ReferenceCandidateEntity("doc",1,1,10,0,"answer",0.8,100);
        when(mapper.questions(1,scope,"shared-vector","fingerprint",0)).thenAnswer(ignored -> { barrier.await(2,TimeUnit.SECONDS); return List.of(candidate); });
        when(mapper.vector(1,scope,"shared-vector","fingerprint",0.55)).thenAnswer(ignored -> { barrier.await(2,TimeUnit.SECONDS); return List.of(candidate); });
        var service=new ReferenceVectorServiceImpl(mapper,manager);
        try {
            assertThat(service.search(1,scope,"shared-vector","fingerprint",ReferencePolicy.defaults())).containsExactly(candidate);
            verify(mapper).questions(1,scope,"shared-vector","fingerprint",0);
            verify(mapper).vector(1,scope,"shared-vector","fingerprint",0.55);
        } finally { service.close(); }
    }
    @Test void search_emptyScope_doesNotQueryDatabase() {
        var mapper=mock(ReferenceHybridMapper.class);
        var service=new ReferenceVectorServiceImpl(mapper,mock(PlatformTransactionManager.class));
        try {
            assertThat(service.search(1,List.of(),"v","f",ReferencePolicy.defaults())).isEmpty();
            verifyNoInteractions(mapper);
        } finally { service.close(); }
    }
}
