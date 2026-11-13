package com.interview.copilot.service.impl.references;

import com.interview.copilot.common.references.ReferenceText;
import com.interview.copilot.entity.references.ReferenceContextEntity;
import com.interview.copilot.entity.references.ReferenceScopeEntity;
import com.interview.copilot.model.operations.OperationContext;
import com.interview.copilot.model.references.ReferenceBatchSelection;
import com.interview.copilot.model.references.ReferenceQueryPlan;
import com.interview.copilot.model.references.ReferenceRecall;
import com.interview.copilot.response.references.ReferenceBatchExcerptResponse;
import com.interview.copilot.response.references.ReferenceBatchRetrievalResponse;
import com.interview.copilot.response.references.ReferenceHybridResponse;
import com.interview.copilot.response.references.ReferenceQueryRetrievalResponse;
import com.interview.copilot.service.references.ReferenceBatchContextService;
import com.interview.copilot.service.references.ReferenceContextService;
import org.springframework.stereotype.Service;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Coverage first; only actual included matched text establishes a question/evidence association. */
@Service
public final class ReferenceBatchContextServiceImpl implements ReferenceBatchContextService {
    private final ReferenceContextService contexts;

    public ReferenceBatchContextServiceImpl(ReferenceContextService contexts) { this.contexts = contexts; }

    public ReferenceBatchRetrievalResponse pack(long user, List<ReferenceScopeEntity> scope,
            List<ReferenceBatchSelection> selections, ReferenceQueryPlan plan, OperationContext context) {
        ReferenceQueryPlan.checkCancellation();
        var eligible = selections.stream().map(selection -> eligible(selection, scope)).toList();
        var candidates = eligible.stream().flatMap(selection -> selection.candidates().stream()).toList();
        var parents = contexts.parents(user, scope, candidates, plan, context);
        var state = new PackState(scope, parents);
        int count = (int) eligible.stream().filter(query -> !query.candidates().isEmpty()).count();
        int share = count == 0 ? 0 : 4800 / count;
        for (var selection : eligible) cover(state, selection, share);
        for (var selection : eligible) if (!state.covered(selection.questionId())) cover(state, selection, 2000);
        int rounds = eligible.stream().mapToInt(query -> query.candidates().size()).max().orElse(0);
        for (int rank = 0; rank < rounds; rank++) for (var selection : eligible)
            if (rank < selection.candidates().size()) state.include(selection.questionId(), selection.candidates().get(rank), 2000);
        var excerpts = state.entries.stream().map(Entry::response).toList();
        var details = eligible.stream().map(selection -> detail(selection, state)).toList();
        String status = details.stream().anyMatch(query -> query.status().equals("degraded")) ? "degraded" : excerpts.isEmpty() ? "empty" : "ready";
        if (context != null) context.child("pg").finish("retrieval.context_pack", status.equals("degraded") ? "degraded" : "success", Map.of("fragmentCount", excerpts.size()));
        return new ReferenceBatchRetrievalResponse(status, details.stream().map(ReferenceQueryRetrievalResponse::message)
                .filter(message -> message != null && !message.isBlank()).distinct().collect(java.util.stream.Collectors.joining("\n")),
                excerpts, details, plan.policy().version(), plan.snapshot() == null ? null : plan.snapshot().view().version());
    }

    private void cover(PackState state, ReferenceBatchSelection selection, int share) {
        for (var candidate : selection.candidates()) if (state.include(selection.questionId(), candidate, share)) return;
    }

    private ReferenceBatchSelection eligible(ReferenceBatchSelection selection, List<ReferenceScopeEntity> scope) {
        var values = selection.candidates().stream().filter(item -> scope.stream().anyMatch(document ->
                document.documentId().equals(item.documentId()) && document.revision() == item.revision())).toList();
        boolean changed = values.size() != selection.candidates().size();
        return new ReferenceBatchSelection(selection.questionId(), changed ? "degraded" : selection.status(),
                selection.message() + (changed ? "部分资料状态或版本已变化，已移除其结果。" : ""), values, selection.hybrid());
    }

    private ReferenceQueryRetrievalResponse detail(ReferenceBatchSelection selection, PackState state) {
        var sent = state.entries.stream().filter(entry -> entry.questionIds.contains(selection.questionId())).toList();
        boolean limited = sent.size() < selection.candidates().size();
        boolean child = sent.stream().anyMatch(entry -> entry.expansion.equals("child"));
        String status = limited || child ? "degraded" : selection.status();
        String message = selection.message() + (limited ? "budget_limited：部分命中未装入整轮资料预算。" : "")
                + (child ? "部分父上下文未完整扩展，已保留实际命中子片段。" : "");
        return new ReferenceQueryRetrievalResponse(selection.questionId(), status, message,
                packed(selection.hybrid(), sent.size()), sent.stream().map(entry -> entry.id).toList());
    }

    private ReferenceHybridResponse packed(ReferenceHybridResponse hybrid, int count) {
        if (hybrid == null) return null;
        var value = hybrid.fusion();
        return new ReferenceHybridResponse(hybrid.bm25(), hybrid.vector(), new ReferenceHybridResponse.Fusion(
                value.method(), value.rankConstant(), count, value.candidateCount(), value.selectedCount(), value.topN()), hybrid.rerank());
    }

    private static String unit(ReferenceRecall.Fused item) {
        long qa = item.matches().getFirst().qaId();
        return item.documentId() + ":" + item.revision() + ":" + (qa > 0 ? "q" + qa : "c" + item.contextId());
    }

    private static boolean containsMatch(String text, ReferenceRecall.Fused item) {
        return item.matches().stream().anyMatch(match -> !match.text().isBlank() && text.contains(match.text()));
    }

    private static final class PackState {
        private final List<ReferenceScopeEntity> scope;
        private final List<ReferenceContextEntity> parents;
        private final List<Entry> entries = new ArrayList<>();
        private int remaining = 4800;

        private PackState(List<ReferenceScopeEntity> scope, List<ReferenceContextEntity> parents) {
            this.scope = scope;
            this.parents = parents;
        }

        private boolean covered(String question) { return entries.stream().anyMatch(entry -> entry.questionIds.contains(question)); }

        private boolean include(String question, ReferenceRecall.Fused item, int share) {
            ReferenceQueryPlan.checkCancellation();
            for (var entry : entries) if (entry.unit.equals(unit(item)) && containsMatch(entry.text, item)) {
                entry.attach(question, item);
                return true;
            }
            if (entries.size() >= 61) return false;
            int budget = Math.min(2000, Math.min(remaining, share));
            var parent = parents.stream().filter(row -> row.documentId().equals(item.documentId())
                    && row.revision() == item.revision() && row.contextId() == item.contextId()).findFirst().orElse(null);
            String parentText = parent == null ? "" : ReferenceText.prefix(parent.sectionPath(), 158) + "\n" + parent.text();
            boolean expanded = parent != null && parentText.length() <= budget && containsMatch(parentText, item);
            String text = expanded ? parentText : matchedText(item, budget);
            if (text.isBlank() || text.length() > budget) return false;
            var document = scope.stream().filter(row -> row.documentId().equals(item.documentId())).findFirst().orElseThrow();
            var entry = new Entry(item, document, parent, text, expanded ? parent.split() ? "partial" : "parent" : "child");
            entry.attach(question, item);
            entries.add(entry);
            remaining -= text.length();
            return true;
        }

        private String matchedText(ReferenceRecall.Fused item, int budget) {
            var selected = new StringBuilder();
            for (String text : item.matches().stream().map(match -> match.text()).distinct().toList()) {
                if (text.isBlank() || selected.length() + text.length() + (selected.isEmpty() ? 0 : 2) > budget) continue;
                if (!selected.isEmpty()) selected.append("\n\n");
                selected.append(text);
            }
            return selected.toString();
        }
    }

    private static final class Entry {
        private final ReferenceRecall.Fused item;
        private final ReferenceScopeEntity document;
        private final ReferenceContextEntity parent;
        private final String text;
        private final String expansion;
        private final String unit;
        private final String id;
        private final LinkedHashSet<String> questionIds = new LinkedHashSet<>();
        private final LinkedHashSet<String> chunks = new LinkedHashSet<>();

        private Entry(ReferenceRecall.Fused item, ReferenceScopeEntity document, ReferenceContextEntity parent,
                String text, String expansion) {
            this.item = item;
            this.document = document;
            this.parent = parent;
            this.text = text;
            this.expansion = expansion;
            unit = unit(item);
            id = UUID.nameUUIDFromBytes((unit + ":" + text).getBytes(StandardCharsets.UTF_8)).toString();
        }

        private void attach(String question, ReferenceRecall.Fused candidate) {
            questionIds.add(question);
            candidate.matches().stream().filter(match -> text.contains(match.text())).map(match -> Long.toString(match.chunkId())).forEach(chunks::add);
        }

        private ReferenceBatchExcerptResponse response() {
            boolean expanded = !expansion.equals("child");
            return new ReferenceBatchExcerptResponse("platform", item.documentId(), item.revision(), document.name(), document.kind(),
                    Long.toString(item.contextId()), text, expanded ? parent.paragraphStart() : 0, expanded ? parent.paragraphEnd() : 0,
                    parent == null ? "" : parent.sectionPath(), chunks.stream().limit(10).toList(), expansion, id, List.copyOf(questionIds));
        }
    }
}
