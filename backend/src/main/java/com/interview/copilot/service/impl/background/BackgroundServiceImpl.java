package com.interview.copilot.service.impl.background;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.interview.copilot.entity.background.BackgroundEntity;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.mapper.background.BackgroundMapper;
import com.interview.copilot.mapper.wallet.WalletMapper;
import com.interview.copilot.model.background.BackgroundKind;
import com.interview.copilot.response.wallet.WalletResponse;
import com.interview.copilot.service.auth.SessionGuardService;
import com.interview.copilot.service.background.BackgroundService;
import com.interview.copilot.service.wallet.WalletService;
import com.interview.copilot.validation.background.BackgroundPolicy;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.ZoneId;
import java.util.UUID;

/**
 * @author Carl Wang
 * @date 2026-09-20
 * @description 管理背景资料、面试类型与开始面试时的背景快照
 */
@Service
@Transactional
public class BackgroundServiceImpl implements BackgroundService {
    private final BackgroundMapper records;
    private final SessionGuardService users;
    private final WalletService wallet;
    private final ObjectMapper json;
    private final WalletMapper sessions;

    public BackgroundServiceImpl(
            BackgroundMapper records,
            SessionGuardService users,
            WalletService wallet,
            ObjectMapper json,
            WalletMapper sessions) {
        this.records = records;
        this.users = users;
        this.wallet = wallet;
        this.json = json;
        this.sessions = sessions;
    }

    public JsonNode library(long user) {
        lock(user);
        initialize(user);
        String active = records.active(user);
        JsonNode environment = detail(user, BackgroundKind.environments, active);
        ObjectNode library = json.createObjectNode().put("activeEnvironmentId", active);
        for (BackgroundKind kind : BackgroundKind.values()) {
            var array = library.putArray(kind.name());
            for (var row : records.list(user, kind)) {
                ObjectNode item = view(row);
                boolean body =
                        kind == BackgroundKind.environments
                                || row.id()
                                        .equals(
                                                environment
                                                        .path(
                                                                kind == BackgroundKind.resumes
                                                                        ? "resumeId"
                                                                        : "targetId")
                                                        .asText());
                if (kind != BackgroundKind.environments) {
                    item.put("bodyLoaded", body);
                    item.put(
                            "hasContent",
                            !item.path(kind == BackgroundKind.resumes ? "text" : "jobDescription")
                                    .asText()
                                    .isBlank());
                    if (!body)
                        item.put(kind == BackgroundKind.resumes ? "text" : "jobDescription", "");
                }
                array.add(item);
            }
        }
        return library;
    }

    public JsonNode detail(long user, BackgroundKind kind, String id) {
        return view(require(user, kind, id));
    }

    public JsonNode save(
            long user,
            BackgroundKind kind,
            String id,
            long version,
            String mutation,
            JsonNode input) {
        lock(user);
        BackgroundPolicy.id(id);
        BackgroundPolicy.id(mutation);
        ObjectNode content = BackgroundPolicy.content(kind, input);
        var previous = records.find(user, kind, id);
        if (previous != null && previous.deleted())
            throw new ApiException(HttpStatus.GONE, "BACKGROUND_DELETED", "资料已删除，不能重新保存。 ");
        if (previous != null && previous.mutationId().equals(mutation)) {
            if (!parse(previous.content()).equals(content)) throw conflict("保存标识已用于其他内容，请重新提交。");
            return view(previous);
        }
        if ((previous == null ? 0 : previous.version()) != version)
            throw conflict("资料已被其他设备修改，请刷新后重新编辑；当前草稿未保存。");
        if (kind == BackgroundKind.environments) {
            validateEnvironment(user, content, false);
            requireEditableType(user, id, content);
        }
        if (previous == null) {
            if (records.list(user, kind).size() >= kind.getLimit())
                throw BackgroundPolicy.invalid("资料数量已达到上限：" + kind.getLimit());
            records.insert(user, kind, id, content.toString(), mutation);
        } else records.update(user, kind, id, content.toString(), mutation);
        if (kind == BackgroundKind.environments) {
            records.clearReferences(user, id);
            content.path("referenceIds")
                    .forEach(ref -> records.addReference(user, id, ref.asText()));
        }
        return detail(user, kind, id);
    }

    public void delete(long user, BackgroundKind kind, String id) {
        lock(user);
        require(user, kind, id);
        if (kind == BackgroundKind.environments) {
            if (id.equals(records.active(user))) throw conflict("不能删除默认面试环境，请先选择其他环境。");
        } else {
            String key = kind == BackgroundKind.resumes ? "resumeId" : "targetId";
            var names =
                    records.list(user, BackgroundKind.environments).stream()
                            .map(row -> parse(row.content()))
                            .filter(row -> id.equals(row.path(key).asText()))
                            .map(row -> row.path("name").asText())
                            .toList();
            if (!names.isEmpty())
                throw conflict("资料正在被环境“" + String.join("”、“", names) + "”使用，请先修改环境选择。");
        }
        if (kind == BackgroundKind.environments) records.clearReferences(user, id);
        records.delete(user, kind, id);
    }

    public void activate(long user, String id) {
        lock(user);
        require(user, BackgroundKind.environments, id);
        records.activate(user, id);
    }

    public WalletResponse start(long user, String requestId, String environmentId) {
        lock(user);
        BackgroundPolicy.id(requestId);
        var previous = sessions.byRequest(user, requestId);
        if (previous != null) {
            var result = wallet.start(user, requestId);
            String saved = records.snapshot(user, previous.id());
            if (saved == null) throw conflict("该面试缺少背景快照，请结束后重新开始。");
            return withBackground(result, parse(saved));
        }
        BackgroundPolicy.id(environmentId);
        ObjectNode environment = view(require(user, BackgroundKind.environments, environmentId));
        validateEnvironment(user, environment, true);
        String resumeId = environment.path("resumeId").asText(null);
        if (resumeId == null) throw BackgroundPolicy.invalid("开始面试前必须选择并填写简历。");
        ObjectNode resume = view(require(user, BackgroundKind.resumes, resumeId));
        if (resume.path("text").asText().isBlank())
            throw BackgroundPolicy.invalid("开始面试前必须填写简历正文。");
        String targetId = environment.path("targetId").asText(null);
        JsonNode target = targetId == null ? null : detail(user, BackgroundKind.targets, targetId);
        ObjectNode snapshot = json.createObjectNode();
        snapshot.set(
                "context",
                json.createObjectNode()
                        .put("name", resume.path("name").asText())
                        .put("text", resume.path("text").asText()));
        ObjectNode jd = snapshot.putObject("interviewTarget");
        for (String field : new String[] {"companyName", "roleName", "jobDescription"})
            jd.put(field, target == null ? "" : target.path(field).asText());
        ObjectNode env = snapshot.putObject("interviewEnvironment");
        for (String field : new String[] {"id", "name", "interviewType", "resumeId", "targetId", "referenceIds"})
            env.set(field, environment.get(field));
        env.put("resumeName", resume.path("name").asText())
                .put("targetName", target == null ? "" : target.path("name").asText());
        var result = wallet.start(user, requestId);
        records.freeze(user, result.session().id(), snapshot.toString());
        return withBackground(result, snapshot);
    }

    private WalletResponse withBackground(WalletResponse value, JsonNode snapshot) {
        return new WalletResponse(
                value.availableSeconds(),
                value.version(),
                value.serverTime(),
                value.session(),
                snapshot);
    }

    private void validateEnvironment(long user, JsonNode content, boolean ready) {
        BackgroundPolicy.interviewType(content.path("interviewType"));
        for (BackgroundKind kind :
                new BackgroundKind[] {BackgroundKind.resumes, BackgroundKind.targets}) {
            String id =
                    content.path(kind == BackgroundKind.resumes ? "resumeId" : "targetId")
                            .asText(null);
            if (id != null) require(user, kind, id);
        }
        for (JsonNode ref : content.path("referenceIds"))
            if (!records.reference(user, ref.asText(), ready))
                throw BackgroundPolicy.invalid(
                        ready ? "所选参考资料不存在、已停用或索引尚未完成，请重新选择。" : "参考资料不存在或不属于当前用户。");
    }

    private void initialize(long user) {
        if (records.active(user) != null) return;
        String id = UUID.randomUUID().toString();
        ObjectNode env =
                json.createObjectNode()
                        .put("name", "默认环境")
                        .put("interviewType", "technical")
                        .putNull("resumeId")
                        .putNull("targetId");
        env.putArray("referenceIds");
        records.insert(
                user,
                BackgroundKind.environments,
                id,
                env.toString(),
                UUID.randomUUID().toString());
        records.activate(user, id);
    }

    private void lock(long user) {
        if (users.lockUser(user) == null) throw missing();
    }

    private void requireEditableType(long user, String environmentId, JsonNode content) {
        var session = sessions.latest(user);
        if (session == null || !"active".equals(session.status())) return;
        String saved = records.snapshot(user, session.id());
        if (saved == null) return;
        JsonNode environment = parse(saved).path("interviewEnvironment");
        if (environmentId.equals(environment.path("id").asText())
                && !content.path("interviewType").equals(environment.path("interviewType"))) {
            throw conflict("面试进行中，不能修改本场面试类型，请先结束面试。");
        }
    }

    private BackgroundEntity require(long user, BackgroundKind kind, String id) {
        BackgroundPolicy.id(id);
        var row = records.find(user, kind, id);
        if (row == null || row.deleted()) throw missing();
        return row;
    }

    private ObjectNode view(BackgroundEntity row) {
        ObjectNode node = (ObjectNode) parse(row.content());
        return node.put("id", row.id())
                .put("version", row.version())
                .put("bodyLoaded", true)
                .put(
                        "createdAt",
                        row.createdAt()
                                .atZone(ZoneId.of("Asia/Shanghai"))
                                .toOffsetDateTime()
                                .toString())
                .put(
                        "updatedAt",
                        row.updatedAt()
                                .atZone(ZoneId.of("Asia/Shanghai"))
                                .toOffsetDateTime()
                                .toString());
    }

    private JsonNode parse(String text) {
        try {
            return json.readTree(text);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("服务器背景资料格式无效", e);
        }
    }

    private ApiException missing() {
        return new ApiException(HttpStatus.NOT_FOUND, "BACKGROUND_NOT_FOUND", "资料不存在或不属于当前用户。");
    }

    private ApiException conflict(String message) {
        return new ApiException(HttpStatus.CONFLICT, "BACKGROUND_CHANGED", message);
    }
}
