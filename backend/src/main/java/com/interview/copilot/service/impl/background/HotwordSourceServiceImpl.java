package com.interview.copilot.service.impl.background;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.mapper.background.BackgroundMapper;
import com.interview.copilot.mapper.background.HotwordSourceMapper;
import com.interview.copilot.mapper.references.ReferenceMapper;
import com.interview.copilot.model.background.BackgroundKind;
import com.interview.copilot.validation.background.BackgroundPolicy;
import org.springframework.stereotype.Service;
import com.interview.copilot.service.background.HotwordSourceService;
import java.util.List;

@Service
public class HotwordSourceServiceImpl implements HotwordSourceService {
    private static final int SOURCE_LIMIT = 12000;
    private final BackgroundMapper backgrounds;
    private final ReferenceMapper references;
    private final ObjectMapper json;
    private final HotwordSourceMapper excerpts;

    public HotwordSourceServiceImpl(BackgroundMapper backgrounds, ReferenceMapper references, ObjectMapper json, HotwordSourceMapper excerpts) {
        this.backgrounds = backgrounds;
        this.references = references;
        this.json = json;
        this.excerpts = excerpts;
    }

    public String read(long user, String resumeId, String targetId, List<String> ids) {
        if (ids == null || ids.size() > 30 || ids.stream().distinct().count() != ids.size()) {
            throw BackgroundPolicy.invalid("最多选择 30 份不重复的参考资料。");
        }
        StringBuilder result = new StringBuilder();
        int budget = (SOURCE_LIMIT - 32) / Math.max(1, ids.size() + (resumeId == null ? 0 : 1) + (targetId == null ? 0 : 1));
        append(result, background(user, BackgroundKind.resumes, resumeId, "text"), budget);
        append(result, background(user, BackgroundKind.targets, targetId, "jobDescription"), budget);
        for (String id : ids) {
            BackgroundPolicy.id(id);
            var document = references.find(user, id);
            if (document == null) throw BackgroundPolicy.invalid("参考资料不存在或不属于当前用户。");
            if (!"ready".equals(document.status())) throw BackgroundPolicy.invalid("参考资料尚未完成解析，请稍后再试。");
            append(result, String.join("\n", excerpts.excerpts(user, id, document.revision(), budget)), budget);
        }
        if (result.toString().isBlank()) throw BackgroundPolicy.invalid("请先选择包含正文的简历、岗位或参考资料。");
        return result.toString();
    }

    private String background(long user, BackgroundKind kind, String id, String field) {
        if (id == null) return "";
        BackgroundPolicy.id(id);
        var row = backgrounds.find(user, kind, id);
        if (row == null || row.deleted()) throw BackgroundPolicy.invalid("资料不存在或不属于当前用户。");
        try {
            return json.readTree(row.content()).path(field).asText();
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("背景资料格式无效", error);
        }
    }

    private void append(StringBuilder result, String value, int limit) {
        int remaining = SOURCE_LIMIT - result.length();
        if (remaining <= 1 || value.isBlank()) return;
        result.append(value, 0, Math.min(value.length(), Math.min(limit, remaining - 1))).append('\n');
    }
}
