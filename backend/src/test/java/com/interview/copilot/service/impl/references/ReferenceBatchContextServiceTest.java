package com.interview.copilot.service.impl.references;

import com.interview.copilot.dto.references.ReferencePolicy;
import com.interview.copilot.entity.references.ReferenceCandidateEntity;
import com.interview.copilot.entity.references.ReferenceContextEntity;
import com.interview.copilot.entity.references.ReferenceScopeEntity;
import com.interview.copilot.model.references.ReferenceBatchSelection;
import com.interview.copilot.model.references.ReferenceQueryPlan;
import com.interview.copilot.model.references.ReferenceRecall;
import com.interview.copilot.service.references.ReferenceContextService;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.stream.IntStream;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ReferenceBatchContextServiceTest {
    private final ReferenceContextService parents = mock(ReferenceContextService.class);
    private final ReferenceBatchContextServiceImpl service = new ReferenceBatchContextServiceImpl(parents);
    private final List<ReferenceScopeEntity> scope = List.of(new ReferenceScopeEntity("doc", 1, "资料", "technical"));
    private final ReferenceQueryPlan plan = ReferenceQueryPlan.start(ReferencePolicy.defaults(), null);

    @Test
    void pack_fiveQuestions_reservesCoverageBeforeExpandingEarlyParents() {
        var selections = IntStream.rangeClosed(1, 5).mapToObj(i -> selection("q" + i, i, i, "命中" + i)).toList();
        when(parents.parents(anyLong(), anyList(), anyList(), any(), any())).thenReturn(IntStream.rangeClosed(1, 5)
                .mapToObj(i -> parent(i, "命中" + i + "父正文".repeat(400))).toList());

        var response = service.pack(1, scope, selections, plan, null);

        assertThat(response.queries()).allSatisfy(query -> assertThat(query.excerptIds()).isNotEmpty());
        assertThat(response.excerpts()).hasSize(5).allSatisfy(excerpt -> assertThat(excerpt.text().length()).isLessThanOrEqualTo(2000));
        assertThat(response.excerpts().stream().mapToInt(excerpt -> excerpt.text().length()).sum()).isLessThanOrEqualTo(4800);
        assertThat(response.queries().getLast().excerptIds()).containsExactly(response.excerpts().getLast().excerptId());
    }

    @Test
    void pack_sharedQaFullBody_isSentOnceAndKeepsBothQuestionAssociations() {
        when(parents.parents(anyLong(), anyList(), anyList(), any(), any())).thenReturn(List.of(parent(1, "first second"), parent(2, "first second")));

        var result = service.pack(1, scope, List.of(selection("q1", 7, 1, "first"), selection("q2", 7, 2, "second")), plan, null);

        assertThat(result.excerpts()).singleElement().satisfies(excerpt -> {
            assertThat(excerpt.questionIds()).containsExactly("q1", "q2");
            assertThat(excerpt.matchedChunkIds()).containsExactly("1", "2");
        });
        assertThat(result.queries()).allSatisfy(query -> assertThat(query.excerptIds()).containsExactly(result.excerpts().getFirst().excerptId()));
    }

    @Test
    void pack_sharedQaDifferentIncludedRanges_neverClaimsMissingTextCoversAnotherQuestion() {
        when(parents.parents(anyLong(), anyList(), anyList(), any(), any())).thenReturn(List.of(parent(1, "first"), parent(2, "second")));

        var result = service.pack(1, scope, List.of(selection("q1", 7, 1, "first"), selection("q2", 7, 2, "second")), plan, null);

        assertThat(result.excerpts()).hasSize(2);
        assertThat(result.excerpts().getFirst().questionIds()).containsExactly("q1");
        assertThat(result.excerpts().getLast().questionIds()).containsExactly("q2");
        assertThat(result.excerpts().getFirst().excerptId()).isNotEqualTo(result.excerpts().getLast().excerptId());
    }

    @Test
    void pack_qaWithManyMatchingChildren_keepsOnlyIncludedHitsWithinBudget() {
        when(parents.parents(anyLong(), anyList(), anyList(), any(), any())).thenReturn(List.of());
        var matches = IntStream.rangeClosed(1, 5).mapToObj(i -> new ReferenceCandidateEntity(
                "doc", 1, i, i, i, String.valueOf(i).repeat(700), 1, 7)).toList();
        var fused = new ReferenceRecall.Fused("doc", 1, 1, 1, 1, null, 1.0, null, 1.0 / 61, matches);

        var result = service.pack(1, scope, List.of(new ReferenceBatchSelection("q1", "ready", "", List.of(fused), null)), plan, null);

        assertThat(result.excerpts()).singleElement().satisfies(excerpt -> {
            assertThat(excerpt.text().length()).isLessThanOrEqualTo(2000);
            assertThat(excerpt.matchedChunkIds()).containsExactly("1", "2");
            assertThat(excerpt.text()).contains(matches.getFirst().text(), matches.get(1).text()).doesNotContain(matches.getLast().text());
        });
        assertThat(result.queries().getFirst().excerptIds()).isNotEmpty();
    }

    @Test
    void pack_sameDocumentDifferentQa_keepsIndependentEvidenceAndDropsStaleRevision() {
        when(parents.parents(anyLong(), anyList(), anyList(), any(), any())).thenReturn(List.of(parent(1, "first"), parent(2, "second")));
        var current = List.of(selection("q1", 7, 1, "first"), selection("q2", 8, 2, "second"));
        assertThat(service.pack(1, scope, current, plan, null).excerpts()).hasSize(2);

        var changed = service.pack(1, List.of(new ReferenceScopeEntity("doc", 2, "新版本", "personal")), current, plan, null);
        assertThat(changed.excerpts()).isEmpty();
        assertThat(changed.queries()).allSatisfy(query -> assertThat(query.status()).isEqualTo("degraded"));
    }

    @Test
    void pack_insufficientBudget_reportsBudgetLimitedInsteadOfEmptyRecall() {
        when(parents.parents(anyLong(), anyList(), anyList(), any(), any())).thenReturn(List.of());
        var selections = IntStream.rangeClosed(1, 5).mapToObj(i -> selection("q" + i, i, i, String.valueOf(i).repeat(1000))).toList();

        var result = service.pack(1, scope, selections, plan, null);

        assertThat(result.excerpts()).hasSize(4);
        assertThat(result.queries().getLast().status()).isEqualTo("degraded");
        assertThat(result.queries().getLast().message()).contains("budget_limited");
        assertThat(result.queries().getLast().excerptIds()).isEmpty();
    }

    private ReferenceBatchSelection selection(String question, long qa, long context, String text) {
        var match = new ReferenceCandidateEntity("doc", 1, context, context, (int) context, text, 1, qa);
        var fused = new ReferenceRecall.Fused("doc", 1, context, (int) context, 1, null, 1.0, null, 1.0 / 61, List.of(match));
        return new ReferenceBatchSelection(question, "ready", "", List.of(fused), null);
    }

    private ReferenceContextEntity parent(long context, String text) {
        return new ReferenceContextEntity("doc", 1, context, text, "标题", "", 1, 2, false);
    }
}
