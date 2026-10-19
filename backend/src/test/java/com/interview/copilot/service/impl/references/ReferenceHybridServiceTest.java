package com.interview.copilot.service.impl.references;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.entity.references.ReferenceScopeEntity;
import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import com.interview.copilot.entity.references.ReferenceContextEntity;
import com.interview.copilot.mapper.references.ReferenceMapper;
import com.interview.copilot.mapper.references.ReferenceHybridMapper;
import com.interview.copilot.model.references.ReferenceRecall;
import com.interview.copilot.service.references.ReferenceParallelService;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import java.util.List;

class ReferenceHybridServiceTest {
    @Test void cachedParent_disabledDocument_isNotReturned_andKindIsNotCached() throws Exception {
        var mapper=Mockito.mock(ReferenceHybridMapper.class);
        var policies=Mockito.mock(ReferenceMapper.class);
        var parallel=Mockito.mock(ReferenceParallelService.class);
        var manager=Mockito.mock(org.springframework.transaction.PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenReturn(new org.springframework.transaction.support.SimpleTransactionStatus());
        var json=new com.fasterxml.jackson.databind.ObjectMapper();
        com.fasterxml.jackson.databind.node.ObjectNode data=json.valueToTree(ReferencePolicy.defaults());
        data.put("cacheEnabled",true);when(policies.policy()).thenReturn(json.treeToValue(data,ReferencePolicy.class));
        var scope=List.of(new ReferenceScopeEntity("doc",1,"资料","technical"));
        when(mapper.scope(anyLong(),anyList())).thenReturn(scope);
        var child=new ReferenceCandidateEntity("doc",1,1,10,0,"命中正文",1,0);
        var branch=new ReferenceRecall.Branch("ready",List.of(child),1);
        when(parallel.recall(anyLong(),anyList(),anyString(),any(),any())).thenReturn(new ReferenceRecall.Pair(branch,branch));
        when(mapper.contexts(anyLong(),anyList(),anyList())).thenReturn(List.of(new ReferenceContextEntity("doc",1,10,"完整父正文","缓存 → 击穿","",1,2,false)));
        var context=new ReferenceContextServiceImpl(mapper,manager,new io.micrometer.core.instrument.simple.SimpleMeterRegistry());
        var service=new ReferenceHybridServiceImpl(policies,mapper,parallel,context);
        assertThat(service.retrieve(1,"query",List.of("doc"),null).excerpts().getFirst().text()).contains("完整父正文");
        assertThat(service.retrieve(1,"query",List.of("doc"),null).excerpts()).hasSize(1);
        Mockito.verify(mapper,Mockito.times(1)).contexts(anyLong(),anyList(),anyList());
        when(mapper.scope(anyLong(),anyList())).thenReturn(List.of(new ReferenceScopeEntity("doc",1,"资料","personal")));
        assertThat(service.retrieve(1,"query",List.of("doc"),null).excerpts().getFirst().kind()).isEqualTo("personal");
        when(mapper.scope(anyLong(),anyList())).thenReturn(List.of());
        assertThat(service.retrieve(1,"query",List.of("doc"),null).excerpts()).isEmpty();
    }
    @Test void revisionChangesDuringRecall_removesOldCandidates() {
        var mapper=Mockito.mock(ReferenceHybridMapper.class);
        var policies=Mockito.mock(ReferenceMapper.class);
        var parallel=Mockito.mock(ReferenceParallelService.class);
        var context=Mockito.mock(com.interview.copilot.service.references.ReferenceContextService.class);
        when(policies.policy()).thenReturn(ReferencePolicy.defaults());
        when(mapper.scope(anyLong(),anyList())).thenReturn(List.of(new ReferenceScopeEntity("doc",1,"资料","technical")),List.of(new ReferenceScopeEntity("doc",2,"资料","technical")));
        var child=new ReferenceCandidateEntity("doc",1,1,10,0,"旧正文",1,0);
        var branch=new ReferenceRecall.Branch("ready",List.of(child),1);
        when(parallel.recall(anyLong(),anyList(),anyString(),any(),any())).thenReturn(new ReferenceRecall.Pair(branch,branch));
        when(context.expand(anyLong(),anyList(),anyList(),any(),any())).thenReturn(List.of());
        var response=new ReferenceHybridServiceImpl(policies,mapper,parallel,context).retrieve(1,"query",List.of("doc"),null);
        assertThat(response.status()).isEqualTo("degraded");
        assertThat(response.excerpts()).isEmpty();
    }
}
