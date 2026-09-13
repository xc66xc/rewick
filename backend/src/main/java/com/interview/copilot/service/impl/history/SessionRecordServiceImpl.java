package com.interview.copilot.service.impl.history;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.entity.history.SessionRecordEntity;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.mapper.history.SessionRecordMapper;
import com.interview.copilot.response.history.RecordPageResponse;
import com.interview.copilot.response.history.RecordResponse;
import com.interview.copilot.service.auth.SessionGuardService;
import com.interview.copilot.service.history.SessionRecordService;
import com.interview.copilot.validation.history.SessionRecordPolicy;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneId;

@Service
public class SessionRecordServiceImpl implements SessionRecordService {
    private final SessionRecordMapper records;
    private final SessionGuardService users;
    private final ObjectMapper json;

    public SessionRecordServiceImpl(
            SessionRecordMapper records, SessionGuardService users, ObjectMapper json) {
        this.records = records;
        this.users = users;
        this.json = json;
    }

    public RecordPageResponse page(long user, long cursor) {
        var rows = records.page(user, cursor);
        var visible = rows.stream().limit(20).toList();
        return new RecordPageResponse(
                visible.stream().map(row -> parse(row.content())).toList(),
                rows.size() > 20 ? visible.getLast().id() : null);
    }

    public RecordResponse read(long user, String id) {
        return response(require(user, id));
    }

    @Transactional
    public RecordResponse save(
            long user, String id, long version, String mutation, JsonNode content) {
        if (users.lockUser(user) == null) throw missing();
        SessionRecordPolicy.validate(id, content);
        var previous = records.find(user, id);
        if (previous != null && previous.deleted())
            throw new ApiException(HttpStatus.GONE, "RECORD_DELETED", "会话已删除，不能重新保存。");
        if (previous != null && previous.mutationId().equals(mutation)) return response(previous);
        if ((previous == null ? 0 : previous.version()) != version)
            throw new ApiException(HttpStatus.CONFLICT, "RECORD_CHANGED", "记录版本已变化，请刷新后查看。");
        if (previous == null)
            records.insert(
                    user,
                    id,
                    content.path("title").asText(),
                    OffsetDateTime.parse(content.path("createdAt").asText())
                            .atZoneSameInstant(ZoneId.of("Asia/Shanghai"))
                            .toLocalDateTime(),
                    content.toString(),
                    mutation,
                    content.path("interviewSessionId").asText(null));
        else records.update(user, id, content.path("title").asText(), content.toString(), mutation);
        return response(records.find(user, id));
    }

    @Transactional
    public void delete(long user, String id) {
        users.lockUser(user);
        var row = records.find(user, id);
        if (row == null) throw missing();
        records.delete(user, id);
    }

    private SessionRecordEntity require(long user, String id) {
        var row = records.find(user, id);
        if (row == null || row.deleted()) throw missing();
        return row;
    }

    private ApiException missing() {
        return new ApiException(HttpStatus.NOT_FOUND, "RECORD_NOT_FOUND", "会话不存在。");
    }

    private RecordResponse response(SessionRecordEntity row) {
        return new RecordResponse(row.version(), parse(row.content()));
    }

    private JsonNode parse(String content) {
        try {
            return json.readTree(content);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("会话数据格式错误", error);
        }
    }
}
